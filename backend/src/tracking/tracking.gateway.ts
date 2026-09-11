import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { TrackingService } from './tracking.service';
import type { LiveLocation } from './location-store.service';

type AuthedSocket = Socket & { data: { userId?: string } };

@WebSocketGateway({
  namespace: '/tracking',
  cors: { origin: true, credentials: true },
})
export class TrackingGateway implements OnGatewayConnection {
  private readonly logger = new Logger(TrackingGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    @Inject(forwardRef(() => TrackingService))
    private readonly tracking: TrackingService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') as
          | string
          | undefined);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        role?: string;
      }>(token);
      client.data.userId = payload.sub;
      // Drivers / passengers join personal rooms for marketplace fan-out.
      if (payload.role === 'DRIVER') {
        await client.join(`driver:${payload.sub}`);
      } else if (payload.role === 'PASSENGER') {
        await client.join(`passenger:${payload.sub}`);
      }
    } catch {
      this.logger.warn('WS auth failed — disconnect');
      client.disconnect(true);
    }
  }

  @SubscribeMessage('driver.subscribe')
  async subscribeDriver(@ConnectedSocket() client: AuthedSocket) {
    if (!client.data.userId) return { ok: false };
    await client.join(`driver:${client.data.userId}`);
    return { ok: true, room: `driver:${client.data.userId}` };
  }

  @SubscribeMessage('passenger.subscribe')
  async subscribePassenger(@ConnectedSocket() client: AuthedSocket) {
    if (!client.data.userId) return { ok: false };
    await client.join(`passenger:${client.data.userId}`);
    return { ok: true, room: `passenger:${client.data.userId}` };
  }

  @SubscribeMessage('ride.subscribe')
  async subscribeRide(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { rideId?: string },
  ) {
    if (!client.data.userId || !body?.rideId) return { ok: false };
    // Access check via getRideLocation
    await this.tracking.getRideLocation(client.data.userId, body.rideId);
    await client.join(`ride:${body.rideId}`);
    return { ok: true, room: `ride:${body.rideId}` };
  }

  @SubscribeMessage('location.update')
  async locationUpdate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      lat: number;
      lng: number;
      heading?: number;
      speedMps?: number;
      accuracyM?: number;
      rideId?: string;
      recordedAt?: string;
    },
  ) {
    if (!client.data.userId) return { ok: false };
    const loc = await this.tracking.ingest(client.data.userId, body);
    return { ok: true, loc };
  }

  emitLocation(rideId: string, loc: LiveLocation) {
    this.server?.to(`ride:${rideId}`).emit('location', loc);
  }

  emitRideEvent(rideId: string, event: Record<string, unknown>) {
    this.server?.to(`ride:${rideId}`).emit('ride.event', event);
  }

  /** Push a marketplace event to one or more driver user rooms. */
  emitToDrivers(userIds: string[], event: string, payload: Record<string, unknown>) {
    if (!this.server || !userIds.length) return;
    for (const userId of userIds) {
      this.server.to(`driver:${userId}`).emit(event, payload);
    }
  }

  /** Push a marketplace event to one or more passenger user rooms. */
  emitToPassengers(
    userIds: string[],
    event: string,
    payload: Record<string, unknown>,
  ) {
    if (!this.server || !userIds.length) return;
    for (const userId of userIds) {
      this.server.to(`passenger:${userId}`).emit(event, payload);
    }
  }
}

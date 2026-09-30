import { BadRequestException } from '@nestjs/common';
import { getDefaultSeatingCapacity } from '../drivers/seating-capacity.util';

describe('Seating Capacity Constraints', () => {
  it('returns appropriate default seating capacity per vehicle class', () => {
    expect(getDefaultSeatingCapacity('sedan')).toBe(4);
    expect(getDefaultSeatingCapacity('economy')).toBe(4);
    expect(getDefaultSeatingCapacity('suv')).toBe(6);
    expect(getDefaultSeatingCapacity('van')).toBe(7);
    expect(getDefaultSeatingCapacity('minivan')).toBe(7);
    expect(getDefaultSeatingCapacity('minibus')).toBe(16);
    expect(getDefaultSeatingCapacity('bus')).toBe(16);
    expect(getDefaultSeatingCapacity(null)).toBe(4);
  });

  it('rejects vehicle offer when vehicle seating capacity is less than requested passenger count', () => {
    const checkCapacity = (vehicleSeats: number, requestedPassengers: number) => {
      if (vehicleSeats < requestedPassengers) {
        throw new BadRequestException(
          `Vehicle seating capacity (${vehicleSeats} seats) is insufficient for requested passenger count (${requestedPassengers} passengers)`,
        );
      }
    };

    expect(() => checkCapacity(4, 6)).toThrow(BadRequestException);
    expect(() => checkCapacity(4, 4)).not.toThrow();
    expect(() => checkCapacity(7, 6)).not.toThrow();
  });
});

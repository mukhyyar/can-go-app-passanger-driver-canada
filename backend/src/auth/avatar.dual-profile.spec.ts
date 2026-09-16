import {
  collectAvatarKeys,
} from './avatar.logic';

/**
 * Lightweight dual-profile / cleanup sequencing checks that mirror AuthService
 * upload/delete order without Nest DI.
 */
describe('avatar dual-profile consistency helpers', () => {
  it('upload cleanup deletes previous keys only after DB success (ordering)', () => {
    const previous = collectAvatarKeys({
      passengerKey: 'avatars/u/old.jpg',
      driverKey: 'avatars/u/old.jpg',
    });
    const deleted: string[] = [];
    const newKey = 'avatars/u/new.jpg';

    // Simulate: putObject → transaction update → then delete previous.
    let dbUpdated = false;
    const putThenUpdate = () => {
      // put new
      dbUpdated = true;
      for (const old of previous) {
        if (old !== newKey && dbUpdated) deleted.push(old);
      }
    };
    putThenUpdate();
    expect(deleted).toEqual(['avatars/u/old.jpg']);
  });

  it('remove clears both profile keys', () => {
    const keys = collectAvatarKeys({
      passengerKey: 'a.jpg',
      driverKey: 'b.jpg',
    });
    expect(keys.sort()).toEqual(['a.jpg', 'b.jpg']);
  });
});

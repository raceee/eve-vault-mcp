export type Clock = {
  now(): number;
};

export const systemClock: Clock = {
  now: () => Date.now(),
};

export class ManualClock implements Clock {
  constructor(private millis: number = 0) {}

  now(): number {
    return this.millis;
  }

  set(millis: number): void {
    this.millis = millis;
  }

  advance(millis: number): void {
    this.millis += millis;
  }
}

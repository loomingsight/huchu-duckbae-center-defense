export interface DamageCommand {
  readonly attackId: string;
  readonly targetId: number;
  readonly amount: number;
}

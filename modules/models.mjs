const { SchemaField, NumberField, BooleanField, StringField } = foundry.data.fields;
export class AvatarModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const vital = () => new NumberField({ integer: true, min: 0, max: 10, initial: 0, required: true });
    const skill = () => new NumberField({ integer: true, min: 0, max: 2, initial: 0, required: true });
    return {
      schemaVersion: new NumberField({ integer: true, initial: 1, required: true }),
      alive: new BooleanField({ initial: true }),
      caseId: new StringField({ initial: "" }),
      role: new StringField({ initial: "" }),
      origin: new StringField({ initial: "" }),
      motivation: new StringField({ initial: "" }),
      biography: new StringField({ initial: "" }),
      contact: new StringField({ initial: "" }),
      food: new NumberField({ integer: true, min: 0, max: 100, initial: 2 }),
      vitals: new SchemaField({ vitality: vital(), agility: vital(), intelligence: vital() }),
      skills: new SchemaField(Object.fromEntries(["movement", "stealth", "perception", "analysis", "negotiation", "knowledge", "craft", "combat"].map(s => [s, skill()]))),
      paidValueH: new NumberField({ integer: true, min: 0, initial: 0 })
    };
  }
}
export class ClueModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({ initial: "" }),
      source: new StringField({ initial: "" }),
      caseId: new StringField({ initial: "" }),
      acquiredAt: new StringField({ initial: "" }),
      medium: new StringField({ initial: "paper", choices: ["paper", "photo", "testimony", "object"] }),
      published: new BooleanField({ initial: false })
    };
  }
}
export class SupplyModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { quantity: new NumberField({ integer: true, min: 0, initial: 1 }), description: new StringField({ initial: "" }) };
  }
}

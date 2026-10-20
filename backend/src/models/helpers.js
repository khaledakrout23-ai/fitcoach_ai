// Colonne JSON (tableaux) : toujours relue comme un tableau JavaScript,
// même si le serveur renvoie une chaîne (cas de MariaDB).
function jsonArray(DataTypes, field) {
  return {
    type: DataTypes.JSON,
    allowNull: true,
    get() {
      const value = this.getDataValue(field);
      if (value == null) return [];
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      }
      return value;
    },
  };
}

// Montant DECIMAL : mysql2 le renvoie en texte, on le convertit en nombre.
function decimal(DataTypes, field, precision = 10, scale = 3) {
  return {
    type: DataTypes.DECIMAL(precision, scale),
    allowNull: false,
    defaultValue: 0,
    get() {
      const value = this.getDataValue(field);
      return value == null ? null : Number(value);
    },
  };
}

module.exports = { jsonArray, decimal };

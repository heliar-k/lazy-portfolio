/**
 * localStorage schema versioning & migration pipeline.
 *
 * Each Zustand store using persist middleware includes a version number.
 * When the stored version doesn't match the current version, migrations run
 * sequentially to bring the state forward.
 *
 * Migrations are pure functions — each one is independently testable.
 */

interface Migration {
  /** Version this migration upgrades FROM */
  fromVersion: number;
  /** Version this migration upgrades TO */
  toVersion: number;
  /** Pure transform function */
  migrate: (state: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Portfolio store migrations.
 *
 * Store key: "lazy-portfolio-portfolios"
 * Current version: 1 (no migrations needed yet — this is the baseline)
 *
 * Add new migrations here when the PortfolioState shape changes:
 *
 * @example
 * const v1_to_v2: Migration = {
 *   fromVersion: 1,
 *   toVersion: 2,
 *   migrate: (state) => ({
 *     ...state,
 *     // new field with default
 *     displayCurrency: (state as any).displayCurrency ?? 'USD',
 *   }),
 * };
 */

const PORTFOLIO_MIGRATIONS: Migration[] = [
  // Add migrations here when schema changes.
  // Example:
  // { fromVersion: 1, toVersion: 2, migrate: (s) => ({ ...s, newField: 'default' }) },
];

// ---------------------------------------------------------------------------
// Registry — maps store keys to their migration chains
// ---------------------------------------------------------------------------

const MIGRATION_REGISTRY: Record<string, Migration[]> = {
  'lazy-portfolio-portfolios': PORTFOLIO_MIGRATIONS,
};

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

export interface MigrationResult {
  state: Record<string, unknown>;
  migrated: boolean;
  fromVersion: number;
  toVersion: number;
}

/**
 * Run migrations on raw stored state to bring it to the target version.
 *
 * @param storeKey - The persist `name` used in Zustand's persist options
 * @param stored - The raw state parsed from localStorage (includes `version` and `state` fields)
 * @param targetVersion - The current `version` number in the store's persist config
 * @returns MigrationResult with migrated state
 */
export function migrateStore(
  storeKey: string,
  stored: Record<string, unknown>,
  targetVersion: number,
): MigrationResult {
  const migrations = MIGRATION_REGISTRY[storeKey];

  if (!migrations || migrations.length === 0) {
    // No migrations registered for this store — pass through
    return {
      state: (stored.state ?? stored) as Record<string, unknown>,
      migrated: false,
      fromVersion: (stored.version as number) ?? 0,
      toVersion: targetVersion,
    };
  }

  let state = (stored.state ?? stored) as Record<string, unknown>;
  let version = (stored.version as number) ?? 0;
  const startVersion = version;
  let migrated = false;

  while (version < targetVersion) {
    const migration = migrations.find((m) => m.fromVersion === version);
    if (!migration) {
      console.warn(
        `[migration] No migration found for ${storeKey} from v${version} to v${version + 1}. ` +
        `Resetting to defaults.`,
      );
      return {
        state: {},
        migrated: true,
        fromVersion: startVersion,
        toVersion: targetVersion,
      };
    }

    try {
      state = migration.migrate(state);
      version = migration.toVersion;
      migrated = true;
    } catch (err) {
      console.error(
        `[migration] Migration v${migration.fromVersion} → v${migration.toVersion} failed for ${storeKey}:`,
        err,
      );
      // On failure, reset to empty state to prevent data corruption
      return {
        state: {},
        migrated: true,
        fromVersion: startVersion,
        toVersion: targetVersion,
      };
    }
  }

  return { state, migrated, fromVersion: startVersion, toVersion: targetVersion };
}

/**
 * Zustand persist middleware `migrate` option.
 *
 * Usage in a store:
 * ```
 * persist(stateCreator, {
 *   name: 'lazy-portfolio-portfolios',
 *   version: 2,
 *   migrate: createMigration('lazy-portfolio-portfolios', 2),
 * })
 * ```
 */
export function createMigration(
  storeKey: string,
  targetVersion: number,
): (persisted: unknown, version: number) => Record<string, unknown> {
  return (persisted: unknown, _version: number) => {
    const stored = persisted as Record<string, unknown>;
    const result = migrateStore(storeKey, stored, targetVersion);
    if (result.migrated) {
      console.log(
        `[migration] ${storeKey}: v${result.fromVersion} → v${result.toVersion}`,
      );
    }
    return result.state;
  };
}

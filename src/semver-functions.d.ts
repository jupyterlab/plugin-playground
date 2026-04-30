declare module 'semver/functions/max-satisfying' {
  interface ISemverOptions {
    includePrerelease?: boolean;
    loose?: boolean;
  }

  export default function maxSatisfying(
    versions: readonly string[],
    range: string,
    options?: ISemverOptions
  ): string | null;
}

declare module 'semver/ranges/valid' {
  interface ISemverOptions {
    includePrerelease?: boolean;
    loose?: boolean;
  }

  export default function validRange(
    range: string,
    options?: ISemverOptions
  ): string | null;
}

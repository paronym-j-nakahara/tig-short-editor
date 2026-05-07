/**
 * i18n の型定義（TIG_PF-10689）。
 * `ja.ts` をマスターとして型を派生させ、`en.ts` も同じ shape を強制する。
 */
import type { ja } from './dictionaries/ja';

export type Dictionary = typeof ja;

export type Locale = 'ja' | 'en';

/**
 * `t('errors.durationOver')` のように dot-notation でアクセスする型。
 * 階層の深さに応じて再帰展開する。
 */
type Join<K, P> = K extends string | number
    ? P extends string | number
        ? `${K}.${P}`
        : never
    : never;

type Paths<T, D extends number = 4> = [D] extends [never]
    ? never
    : T extends object
        ? { [K in keyof T]-?: K extends string | number ? `${K}` | Join<K, Paths<T[K], Prev[D]>> : never }[keyof T]
        : '';

type Prev = [never, 0, 1, 2, 3, 4];

export type TranslationKey = Paths<Dictionary>;

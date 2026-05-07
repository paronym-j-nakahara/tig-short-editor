'use client';

import { useAppSelector } from '@/app/store';
import { useMemo } from 'react';
import { ja } from './dictionaries/ja';
import { en } from './dictionaries/en';
import type { Dictionary, Locale, TranslationKey } from './types';

const DICTIONARIES: Record<Locale, Dictionary> = { ja, en };
const DEFAULT_LOCALE: Locale = 'ja';

/**
 * Locale を解決する優先順位:
 * 1. embed mode で CMS が `init.ui.locale` を送ってきた値（embedSlice.locale）
 * 2. ブラウザの navigator.language（先頭 2 文字）
 * 3. DEFAULT_LOCALE
 *
 * SSR では navigator が無いため、初期は DEFAULT_LOCALE になり、
 * クライアント hydration 後に navigator.language で再評価される。
 */
function resolveLocale(embedLocale: Locale | null): Locale {
    if (embedLocale && embedLocale in DICTIONARIES) return embedLocale;
    if (typeof navigator !== 'undefined' && navigator.language) {
        const lang = navigator.language.slice(0, 2).toLowerCase();
        if (lang in DICTIONARIES) return lang as Locale;
    }
    return DEFAULT_LOCALE;
}

/**
 * dot-notation で辞書から文字列を取り出す。
 * 取り出せない場合は key そのものを返す（フォールバック）。
 */
function lookup(dict: Dictionary, key: string): string {
    const segments = key.split('.');
    let cursor: unknown = dict;
    for (const seg of segments) {
        if (cursor && typeof cursor === 'object' && seg in (cursor as Record<string, unknown>)) {
            cursor = (cursor as Record<string, unknown>)[seg];
        } else {
            return key;
        }
    }
    return typeof cursor === 'string' ? cursor : key;
}

/**
 * `{name}` placeholder を params の値で置換する。
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, name) => {
        const v = params[name];
        return v !== undefined ? String(v) : `{${name}}`;
    });
}

/**
 * 軽量翻訳フック（TIG_PF-10689）。next-intl 等のライブラリは導入せず、
 * embedSlice.locale + navigator.language で言語を決める。
 *
 * Usage:
 *   const { t, locale } = useTranslation();
 *   t('common.loadingProject')
 *   t('errors.durationOver', { max: 180, actual: 200.5 })
 */
export function useTranslation() {
    const embedLocale = useAppSelector((state) => state.embed.locale);
    const locale = useMemo(() => resolveLocale(embedLocale), [embedLocale]);
    const dict = DICTIONARIES[locale];

    const t = useMemo(() => {
        return (key: TranslationKey, params?: Record<string, string | number>): string => {
            const template = lookup(dict, key);
            return interpolate(template, params);
        };
    }, [dict]);

    return { t, locale };
}

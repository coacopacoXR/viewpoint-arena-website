/** Shared prop types for the design-system components. */

/** One line of a `Display` heading. `outline` = starts outlined, fills on scroll. */
export interface DisplayLine {
  text: string;
  outline?: boolean;
}

/** Reveal flavours understood by `src/scripts/motion.ts` (`data-reveal`). */
export type Reveal = 'lines' | 'up' | 'fade';

/** Shell a `Command` block is tagged with (CONTENT.md /install). */
export type CommandLang = 'Ubuntu' | 'PowerShell';

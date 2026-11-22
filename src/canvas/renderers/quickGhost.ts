// The quick-review ghost on the canvas (stage #1932, QR2): ONE non-listening group at the bottom of
// the overlays layer that holds the drawings and the review marks of the markings a proposal
// creates or changes, translucent and grey. The group is cached as a bitmap with the grayscale
// filter, so a pan only moves the stage: the cache is redone only when the ghost's content, the
// theme or the zoom scale change. Konva details live here; the data comes from `quickGhost.ts`.
import Konva from 'konva/lib/Core';
import { Grayscale } from 'konva/lib/filters/Grayscale';
import type { Placement } from '../../model';
import type { ComponentLayerRenderer } from '../components/componentLayer';
import type { Frame, QuickFrame } from '../frame';
import { sameGhost } from '../quickGhost';
import { ReviewRenderer } from './review';

/** Builds the drawings renderer for a parent; `onLoaded` runs when an embedded image finishes. */
export type MakeDrawings = (
  parent: Konva.Group,
  onLoaded: () => void,
) => ComponentLayerRenderer;

export type QuickGhostFrame = Pick<
  Frame,
  'quickGhost' | 'tokens' | 'locale' | 'viewport'
>;

/** The ghost shows whole: the review marks cull against this canvas area, so pan never changes them. */
const HALF_CANVAS = 1e7;
/** Longest side of the cached bitmap (px); a larger ghost caches at a lower resolution. */
const MAX_CACHE_SIDE = 4096;

export class QuickGhostRenderer {
  private readonly drawingsGroup = new Konva.Group({ listening: false });
  private readonly reviewGroup = new Konva.Group({ listening: false });
  private drawings: ComponentLayerRenderer;
  private readonly review: ReviewRenderer;
  private drawn: QuickFrame | null = null;
  private tokens: Frame['tokens'] | null = null;
  private locale: Frame['locale'] | null = null;
  private scale = 0;
  /** An embedded image finished loading, or a remote one changed: the bitmap is stale. */
  private stale = false;

  constructor(
    private readonly group: Konva.Group,
    private readonly makeDrawings: MakeDrawings,
  ) {
    group.add(this.drawingsGroup, this.reviewGroup);
    group.filters([Grayscale]);
    this.drawings = makeDrawings(this.drawingsGroup, () => this.markStale());
    this.review = new ReviewRenderer(this.reviewGroup);
  }

  private markStale(): void {
    this.stale = true;
  }

  /** An image of a ghost drawing changed since the last redraw: `render` must run even if the frame did not change. */
  get isStale(): boolean {
    return this.stale;
  }

  /**
   * Updates the group for `frame`. Returns `true` if it touched any node (the overlays layer needs
   * a draw). `placementsChanged`: the image positions changed since the last frame.
   */
  render(
    frame: QuickGhostFrame,
    placements: ReadonlyMap<string, Placement>,
    placementsChanged: boolean,
  ): boolean {
    const quick = frame.quickGhost ?? null;
    if (quick === null) return this.clear(frame, placements);
    const show = quick.mode === 'ghost';
    let touched = this.group.visible() !== show;
    this.group.visible(show);
    if (!show || !this.needsRedraw(quick, frame, placementsChanged)) return touched;
    this.draw(quick, frame, placements);
    touched = true;
    return touched;
  }

  private needsRedraw(
    quick: QuickFrame,
    frame: QuickGhostFrame,
    placementsChanged: boolean,
  ): boolean {
    const last = this.drawn;
    return (
      this.stale ||
      placementsChanged ||
      last === null ||
      this.tokens !== frame.tokens ||
      this.locale !== frame.locale ||
      this.scale !== frame.viewport.scale ||
      !sameGhost(last.ghost, quick.ghost)
    );
  }

  private draw(
    quick: QuickFrame,
    frame: QuickGhostFrame,
    placements: ReadonlyMap<string, Placement>,
  ): void {
    const { tokens } = frame;
    const scale = frame.viewport.scale;
    this.releaseCache();
    if (this.tokens !== null && tokens.component !== this.tokens.component) {
      // The placeholder colors are fixed when a drawing is mounted: a new theme, new drawings.
      this.drawings.destroy();
      this.drawings = this.makeDrawings(this.drawingsGroup, () => this.markStale());
    }
    this.drawings.render(quick.ghost.drawings, () => true, placements, scale, null);
    this.drawings.setZoom(scale);
    this.review.render(
      {
        project: quick.preview,
        review: quick.ghost.review,
        tokens,
        size: { width: 2 * HALF_CANVAS * scale, height: 2 * HALF_CANVAS * scale },
        viewport: { x: HALF_CANVAS * scale, y: HALF_CANVAS * scale, scale },
      },
      placements,
    );
    this.group.opacity(tokens.opacity.ghost);
    this.drawn = quick;
    this.tokens = tokens;
    this.locale = frame.locale;
    this.scale = scale;
    this.stale = false;
    this.cacheBitmap(scale);
  }

  /** No quick review: the content goes away (once). Returns `true` if it touched anything. */
  private clear(
    frame: QuickGhostFrame,
    placements: ReadonlyMap<string, Placement>,
  ): boolean {
    if (this.drawn === null) return false;
    this.releaseCache();
    this.drawings.render(new Map(), () => true, placements, frame.viewport.scale, null);
    this.review.render(
      {
        project: null,
        review: null,
        tokens: frame.tokens,
        size: { width: 1, height: 1 },
        viewport: { x: 0, y: 0, scale: frame.viewport.scale },
      },
      placements,
    );
    this.drawn = null;
    this.stale = false;
    return true;
  }

  /** The drawings of the markings whose remote images changed (`null`: all of them). */
  refreshImages(urls: ReadonlySet<string> | null): void {
    if (this.drawings.refreshImages(urls)) this.markStale();
  }

  /** The drawings of the markings whose package images finished decoding. */
  refreshPackageImages(keys: ReadonlySet<string>): void {
    if (this.drawings.refreshPackageImages(keys)) this.markStale();
  }

  private releaseCache(): void {
    try {
      this.group.clearCache();
    } catch {
      // Nothing cached.
    }
  }

  /**
   * Caches the group as a bitmap at the zoom scale, so the grayscale filter runs once per redraw
   * and not per frame. A tainted canvas (remote image) or an empty group makes Konva throw or skip:
   * the ghost then stays a live translucent group (opacity only), never a crash.
   */
  private cacheBitmap(scale: number): void {
    try {
      const box = this.group.getClientRect({ skipTransform: true });
      if (!(box.width > 0 && box.height > 0)) return;
      const side = Math.max(box.width, box.height);
      const pixelRatio = Math.max(0.05, Math.min(scale, MAX_CACHE_SIDE / side));
      this.group.cache({ pixelRatio });
    } catch {
      this.releaseCache();
    }
  }

  destroy(): void {
    this.drawings.destroy();
    this.group.destroy();
  }
}

import { controlLabel, isControlAvailable } from './control-availability';
import type { FederatedProvider } from './federated-providers';
import type { AutofillResponse } from './messages';

const providerLabels: Record<FederatedProvider, RegExp> = {
  google: /\bgoogle\b/u,
  apple: /\bapple\b/u,
  facebook: /\bfacebook\b/u,
  twitter: /\b(?:twitter|x)\b/u,
  microsoft: /\b(?:microsoft|windows live)\b/u,
  github: /\bgithub\b/u,
};

export function federatedProvider(control: HTMLElement): FederatedProvider | null {
  const label = controlLabel(control).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
  if (!/(?:\b(?:sign[ -]?in|log[ -]?in|continue)\b|ログイン|サインイン|続行|続ける)/u.test(label) ||
    /(?:\b(?:sign[ -]?up|sign[ -]?out|log[ -]?out|create|register|connect|link|unlink|disconnect|manage|delete|remove|authorize|approve|grant)\b|作成|登録|連携|設定|管理|削除|解除|許可|承認|ログアウト)/u.test(label)) return null;
  const providers = (Object.entries(providerLabels) as [FederatedProvider, RegExp][])
    .filter(([, pattern]) => pattern.test(label));
  return providers.length === 1 ? providers[0]![0] : null;
}

export function findFederatedLoginButtons(root: ParentNode = document): { control: HTMLElement; provider: FederatedProvider }[] {
  if (root.querySelector('input[autocomplete~="new-password" i]')) return [];
  return Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input[type="button"], input[type="submit"], [role="button"]'))
    .flatMap((control) => {
      const provider = federatedProvider(control);
      if (!provider || !isControlAvailable(control)) return [];
      // A nested role/button must not turn one action into multiple candidates.
      const parent = control.parentElement?.closest<HTMLElement>('button, a[href], [role="button"]');
      return parent && federatedProvider(parent) === provider ? [] : [{ control, provider }];
    });
}

interface FederatedLoginOptions {
  root: ParentNode;
  canStart: () => boolean;
  getPolicy: () => Promise<AutofillResponse>;
}

export class FederatedLoginController {
  private attempted = false;
  private interacted = false;
  private inFlight = false;
  private generation = 0;
  private denied = false;

  constructor(private readonly options: FederatedLoginOptions) {}

  invalidatePolicy(): void {
    this.denied = false;
    this.generation++;
  }

  markUserInteraction(): void {
    this.interacted = true;
    this.generation++;
  }

  async evaluate(explicit = false): Promise<boolean> {
    if (!this.options.canStart() || this.inFlight || this.attempted) return false;
    if (explicit) {
      this.interacted = false;
      this.invalidatePolicy();
    }
    if (this.interacted) return false;
    const candidates = findFederatedLoginButtons(this.options.root);
    if (!candidates.length) return false;
    const generation = this.generation;
    this.inFlight = true;
    try {
      const policy = this.denied ? { ok: true, action: 'ignore' } as const : await this.options.getPolicy();
      if (!this.options.canStart() || generation !== this.generation || this.interacted) return false;
      if (policy.ok && policy.action === 'submit' && policy.method === 'federated' && policy.provider) {
        const matches = candidates.filter(({ provider }) => provider === policy.provider);
        const current = findFederatedLoginButtons(this.options.root).filter(({ provider }) => provider === policy.provider);
        if (matches.length !== 1 || current.length !== 1 || current[0]!.control !== matches[0]!.control) return false;
        // Cancelled authentication and a replaced button must not start another attempt.
        this.attempted = true;
        current[0]!.control.click();
        return true;
      }
      if (policy.ok && policy.action === 'ignore') {
        this.denied = true;
      }
    } catch {
      // Keep the site's normal sign-in flow available after worker disconnection.
    } finally {
      this.inFlight = false;
    }
    return false;
  }
}

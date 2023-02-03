import type { Adapter, Composition, CSS } from './types.ts';
import { injectStyles } from './injectStyles.ts';
import { transformCss } from './transformCss.ts';
import { setAdapterIfNotSet } from './adapter.ts';

const localClassNames = new Set<string>();
const composedClassLists: Array<Composition> = [];
let bufferedCSSObjs: Array<CSS> = [];

const browserRuntimeAdapter: Adapter = {
  appendCss: (cssObj: CSS) => {
    bufferedCSSObjs.push(cssObj);
  },
  registerClassName: (className) => {
    localClassNames.add(className);
  },
  registerComposition: (composition) => {
    composedClassLists.push(composition);
  },
  markCompositionUsed: () => {},
  onEndFileScope: (fileScope) => {
    const css = transformCss({
      localClassNames: Array.from(localClassNames),
      composedClassLists,
      cssObjs: bufferedCSSObjs,
    }).join('\n');

    injectStyles({ fileScope, css });

    bufferedCSSObjs = [];
  },
  getIdentOption: () =>
    'production' === 'production' ? 'short' : 'debug',
};

if (typeof window !== 'undefined') {
  setAdapterIfNotSet(browserRuntimeAdapter);
}

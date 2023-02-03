import outdent from 'https://deno.land/x/outdent@v0.8.0/src/index.ts';
import { toAST } from '../media-query-parser/syntacticAnalysis.ts';

const createMediaQueryError = (mediaQuery: string, msg: string) =>
  new Error(
    outdent`
    Invalid media query: "${mediaQuery}"

    ${msg}

    Read more on MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries
  `,
  );

export const validateMediaQuery = (mediaQuery: string) => {
  // Empty queries will start with '@media '
  if (mediaQuery === '@media ') {
    throw createMediaQueryError(mediaQuery, 'Query is empty');
  }

  try {
    toAST(mediaQuery);
  } catch (e: any) {
    throw createMediaQueryError(mediaQuery, e.message);
  }
};

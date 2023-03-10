import {
  AST,
  MediaCondition,
  MediaFeature,
  MediaQuery
} from './syntacticAnalysis.ts';

// Mutates, assumes AST represents a valid media query
export const simplifyAST = (ast: AST): AST => {
  for (let i = ast.length - 1; i >= 0; i--) {
    ast[i] = simplifyMediaQuery(ast[i])
  }

  return ast
}

const simplifyMediaQuery = (mediaQuery: MediaQuery): MediaQuery => {
  if (mediaQuery.mediaCondition === null) return mediaQuery

  let mediaCondition = simplifyMediaCondition(mediaQuery.mediaCondition)
  if (
    mediaCondition.operator === null &&
    mediaCondition.children.length === 1 &&
    'children' in mediaCondition.children[0]
  ) {
    mediaCondition = mediaCondition.children[0]
  }

  return {
    mediaPrefix: mediaQuery.mediaPrefix,
    mediaType: mediaQuery.mediaType,
    mediaCondition
  }
}

const simplifyMediaCondition = (
  mediaCondition: MediaCondition
): MediaCondition => {
  for (let i = mediaCondition.children.length - 1; i >= 0; i--) {
    const unsimplifiedChild = mediaCondition.children[i] as
      | MediaCondition
      | MediaFeature
    if (!('context' in unsimplifiedChild)) {
      const child = simplifyMediaCondition(unsimplifiedChild) as MediaCondition
      if (child.operator === null && child.children.length === 1) {
        mediaCondition.children[i] = child.children[0]
      } else if (
        child.operator === mediaCondition.operator &&
        (child.operator === 'and' || child.operator === 'or')
      ) {
        const spliceArgs: [
          start: number,
          deleteCount: number,
          ...args: Array<MediaCondition | MediaFeature>
        ] = [i, 1]
        for (let i = 0; i < child.children.length; i++) {
          spliceArgs.push(child.children[i])
        }
        mediaCondition.children.splice.apply(
          mediaCondition.children,
          spliceArgs
        )
      }
    }
  }

  return mediaCondition
}

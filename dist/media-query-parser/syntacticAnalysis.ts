import {
  DimensionToken,
  IdentToken,
  lexicalAnalysis,
  NumberToken,
  Token
} from './lexicalAnalysis.ts';
import { simplifyAST } from './simplifyAST.ts';

const createError = (message: string, err?: unknown): Error => {
  if (err instanceof Error) {
    return new Error(`${err.message.trim()}\n${message.trim()}`)
  } else {
    return new Error(message.trim())
  }
}

type WToken = Token & { wsBefore: boolean; wsAfter: boolean }

export type AST = MediaQuery[]

export const toAST = (str: string): AST => {
  return simplifyAST(toUnflattenedAST(str))
}

export const toUnflattenedAST = (str: string): AST => {
  let tokenList = lexicalAnalysis(str.trim())

  // failed tokenizing
  if (tokenList === null) {
    throw createError('Failed tokenizing')
  }

  // trim the @media and { where applicable
  let startIndex = 0
  let endIndex = tokenList.length - 1
  if (
    tokenList[0].type === '<at-keyword-token>' &&
    tokenList[0].value === 'media'
  ) {
    if (tokenList[1].type !== '<whitespace-token>') {
      throw createError('Expected whitespace after media')
    }

    startIndex = 2
    for (let i = 2; i < tokenList.length - 1; i++) {
      const token = tokenList[i]
      if (token.type === '<{-token>') {
        endIndex = i
        break
      } else if (token.type === '<semicolon-token>') {
        throw createError("Expected '{' in media query but found ';'")
      }
    }
  }

  tokenList = tokenList.slice(startIndex, endIndex)

  return syntacticAnalysis(tokenList)
}

export const removeWhitespace = (tokenList: Token[]): WToken[] => {
  const newTokenList: WToken[] = []

  let before = false
  for (let i = 0; i < tokenList.length; i++) {
    if (tokenList[i].type === '<whitespace-token>') {
      before = true
      if (newTokenList.length > 0) {
        newTokenList[newTokenList.length - 1].wsAfter = true
      }
    } else {
      newTokenList.push({
        ...tokenList[i],
        wsBefore: before,
        wsAfter: false
      })
      before = false
    }
  }

  return newTokenList
}

export const syntacticAnalysis = (tokenList: Token[]): MediaQuery[] => {
  const mediaQueryList: Array<Array<Token>> = [[]]
  for (let i = 0; i < tokenList.length; i++) {
    const token = tokenList[i]
    if (token.type === '<comma-token>') {
      mediaQueryList.push([])
    } else {
      mediaQueryList[mediaQueryList.length - 1].push(token)
    }
  }

  const mediaQueries = mediaQueryList.map(removeWhitespace)
  if (mediaQueries.length === 1 && mediaQueries[0].length === 0) {
    // '@media {' is fine, treat as all
    return [{ mediaCondition: null, mediaPrefix: null, mediaType: 'all' }]
  } else {
    const mediaQueryTokens = mediaQueries.map((mediaQueryTokens) => {
      if (mediaQueryTokens.length === 0) {
        return null
      } else {
        return tokenizeMediaQuery(mediaQueryTokens)
      }
    })

    const nonNullMediaQueryTokens: MediaQuery[] = []
    for (const mediaQueryToken of mediaQueryTokens) {
      if (mediaQueryToken !== null) {
        nonNullMediaQueryTokens.push(mediaQueryToken)
      }
    }

    if (nonNullMediaQueryTokens.length === 0) {
      throw createError('No valid media queries')
    }

    return nonNullMediaQueryTokens
  }
}

export type MediaQuery = {
  mediaPrefix: 'not' | 'only' | null
  mediaType: 'all' | 'screen' | 'print'
  mediaCondition: MediaCondition | null
}

export const tokenizeMediaQuery = (tokens: WToken[]): MediaQuery => {
  const firstToken = tokens[0]
  if (firstToken.type === '<(-token>') {
    try {
      return {
        mediaPrefix: null,
        mediaType: 'all',
        mediaCondition: tokenizeMediaCondition(tokens, true)
      }
    } catch (err) {
      throw createError("Expected media condition after '('", err)
    }
  } else if (firstToken.type === '<ident-token>') {
    let mediaPrefix: 'not' | 'only' | null = null
    let mediaType: 'all' | 'print' | 'screen'

    const { value } = firstToken
    if (value === 'only' || value === 'not') {
      mediaPrefix = value
    }

    const firstIndex = mediaPrefix === null ? 0 : 1

    if (tokens.length <= firstIndex) {
      throw createError(`Expected extra token in media query`)
    }

    const firstNonUnaryToken = tokens[firstIndex]

    if (firstNonUnaryToken.type === '<ident-token>') {
      const { value } = firstNonUnaryToken

      if (value === 'all') {
        mediaType = 'all'
      } else if (value === 'print' || value === 'screen') {
        mediaType = value
      } else if (
        value === 'tty' ||
        value === 'tv' ||
        value === 'projection' ||
        value === 'handheld' ||
        value === 'braille' ||
        value === 'embossed' ||
        value === 'aural' ||
        value === 'speech'
      ) {
        // these are treated as equivalent to 'not all'
        mediaPrefix = mediaPrefix === 'not' ? null : 'not'
        mediaType = 'all'
      } else {
        throw createError(`Unknown ident '${value}' in media query`)
      }
    } else if (
      mediaPrefix === 'not' &&
      firstNonUnaryToken.type === '<(-token>'
    ) {
      const tokensWithParens: WToken[] = [
        { type: '<(-token>', wsBefore: false, wsAfter: false }
      ]
      tokensWithParens.push.apply(tokensWithParens, tokens)
      tokensWithParens.push({
        type: '<)-token>',
        wsBefore: false,
        wsAfter: false
      })

      try {
        return {
          mediaPrefix: null,
          mediaType: 'all',
          mediaCondition: tokenizeMediaCondition(tokensWithParens, true)
        }
      } catch (err) {
        throw createError("Expected media condition after '('", err)
      }
    } else {
      throw createError('Invalid media query')
    }

    if (firstIndex + 1 === tokens.length) {
      return {
        mediaPrefix,
        mediaType,
        mediaCondition: null
      }
    } else if (firstIndex + 4 < tokens.length) {
      const secondNonUnaryToken = tokens[firstIndex + 1]
      if (
        secondNonUnaryToken.type === '<ident-token>' &&
        secondNonUnaryToken.value === 'and'
      ) {
        try {
          return {
            mediaPrefix,
            mediaType,
            mediaCondition: tokenizeMediaCondition(
              tokens.slice(firstIndex + 2),
              false
            )
          }
        } catch (err) {
          throw createError("Expected media condition after 'and'", err)
        }
      } else {
        throw createError("Expected 'and' after media prefix")
      }
    } else {
      throw createError('Expected media condition after media prefix')
    }
  } else {
    throw createError('Expected media condition or media prefix')
  }
}

export type MediaCondition = {
  operator: 'and' | 'or' | 'not' | null
  children: Array<MediaCondition | MediaFeature>
}

export const tokenizeMediaCondition = (
  tokens: WToken[],
  mayContainOr: boolean,
  previousOperator: 'and' | 'or' | 'not' | null = null
): MediaCondition => {
  if (
    tokens.length < 3 ||
    tokens[0].type !== '<(-token>' ||
    tokens[tokens.length - 1].type !== '<)-token>'
  ) {
    throw new Error('Invalid media condition')
  }

  let endIndexOfFirstFeature = tokens.length - 1
  let maxDepth = 0
  let count = 0
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type === '<(-token>') {
      count += 1
      maxDepth = Math.max(maxDepth, count)
    } else if (token.type === '<)-token>') {
      count -= 1
    }
    if (count === 0) {
      endIndexOfFirstFeature = i
      break
    }
  }

  if (count !== 0) {
    throw new Error('Mismatched parens\nInvalid media condition')
  }

  let child: MediaCondition | MediaFeature | null
  const featureTokens = tokens.slice(0, endIndexOfFirstFeature + 1)
  if (maxDepth === 1) {
    child = tokenizeMediaFeature(featureTokens)
  } else {
    if (
      featureTokens[1].type === '<ident-token>' &&
      featureTokens[1].value === 'not'
    ) {
      child = tokenizeMediaCondition(featureTokens.slice(2, -1), true, 'not')
    } else {
      child = tokenizeMediaCondition(featureTokens.slice(1, -1), true)
    }
  }

  if (endIndexOfFirstFeature === tokens.length - 1) {
    return {
      operator: previousOperator,
      children: [child]
    }
  } else {
    // read for a boolean op "and", "not", "or"
    const nextToken = tokens[endIndexOfFirstFeature + 1]
    if (nextToken.type !== '<ident-token>') {
      throw new Error('Invalid operator\nInvalid media condition')
    } else if (
      previousOperator !== null &&
      previousOperator !== nextToken.value
    ) {
      throw new Error(
        `'${nextToken.value}' and '${previousOperator}' must not be at same level\nInvalid media condition`
      )
    } else if (nextToken.value === 'or' && !mayContainOr) {
      throw new Error(
        "Cannot use 'or' at top level of a media query\nInvalid media condition"
      )
    } else if (nextToken.value !== 'and' && nextToken.value !== 'or') {
      throw new Error(
        `Invalid operator: '${nextToken.value}'\nInvalid media condition`
      )
    }

    const siblings = tokenizeMediaCondition(
      tokens.slice(endIndexOfFirstFeature + 2),
      mayContainOr,
      nextToken.value
    )

    return {
      operator: nextToken.value,
      children: [child].concat(siblings.children)
    }
  }
}

export type MediaFeature =
  | MediaFeatureBoolean
  | MediaFeatureValue
  | MediaFeatureRange
export type MediaFeatureBoolean = {
  context: 'boolean'
  feature: string
}
export type MediaFeatureValue = {
  context: 'value'
  prefix: 'min' | 'max' | null
  feature: string
  value: ValidValueToken
}
export type MediaFeatureRange = {
  context: 'range'
  feature: string
  range: ValidRange
}
export type ValidValueToken =
  | NumberToken
  | DimensionToken
  | RatioToken
  | IdentToken

export const tokenizeMediaFeature = (rawTokens: WToken[]): MediaFeature => {
  if (
    rawTokens.length < 3 ||
    rawTokens[0].type !== '<(-token>' ||
    rawTokens[rawTokens.length - 1].type !== '<)-token>'
  ) {
    throw new Error('Invalid media feature')
  }

  const tokens: ConvenientToken[] = [rawTokens[0]]

  for (let i = 1; i < rawTokens.length; i++) {
    if (i < rawTokens.length - 2) {
      const a = rawTokens[i]
      const b = rawTokens[i + 1]
      const c = rawTokens[i + 2]
      if (
        a.type === '<number-token>' &&
        a.value > 0 &&
        b.type === '<delim-token>' &&
        b.value === 0x002f &&
        c.type === '<number-token>' &&
        c.value > 0
      ) {
        tokens.push({
          type: '<ratio-token>',
          numerator: a.value,
          denominator: c.value,
          wsBefore: a.wsBefore,
          wsAfter: c.wsAfter
        })
        i += 2
        continue
      }
    }
    tokens.push(rawTokens[i])
  }

  const nextToken = tokens[1]
  if (nextToken.type === '<ident-token>' && tokens.length === 3) {
    return {
      context: 'boolean',
      feature: nextToken.value
    }
  } else if (
    tokens.length === 5 &&
    tokens[1].type === '<ident-token>' &&
    tokens[2].type === '<colon-token>'
  ) {
    const valueToken = tokens[3]
    if (
      valueToken.type === '<number-token>' ||
      valueToken.type === '<dimension-token>' ||
      valueToken.type === '<ratio-token>' ||
      valueToken.type === '<ident-token>'
    ) {
      let feature = tokens[1].value

      let prefix: 'min' | 'max' | null = null

      const slice = feature.slice(0, 4)
      if (slice === 'min-') {
        prefix = 'min'
        feature = feature.slice(4)
      } else if (slice === 'max-') {
        prefix = 'max'
        feature = feature.slice(4)
      }

      const { wsBefore: _0, wsAfter: _1, ...value } = valueToken

      return {
        context: 'value',
        prefix,
        feature,
        value
      }
    }
  } else if (tokens.length >= 5) {
    try {
      const range = tokenizeRange(tokens)
      return {
        context: 'range',
        feature: range.featureName,
        range
      }
    } catch (err) {
      throw createError('Invalid media feature', err)
    }
  }

  throw new Error('Invalid media feature')
}

export type RatioToken = {
  type: '<ratio-token>'
  numerator: number
  denominator: number
}
export type ValidRangeToken =
  | NumberToken
  | DimensionToken
  | RatioToken
  | {
      type: '<ident-token>'
      value: 'infinite'
    }

type ConvenientToken =
  | WToken
  | (RatioToken & { wsBefore: boolean; wsAfter: boolean })

type UncheckedRange = {
  leftToken: ConvenientToken | null
  leftOp: '>=' | '<=' | '>' | '<' | '=' | null
  featureName: string
  rightOp: '>=' | '<=' | '>' | '<' | '=' | null
  rightToken: ConvenientToken | null
}

export type ValidRange =
  | {
      leftToken: ValidRangeToken
      leftOp: '<' | '<='
      featureName: string
      rightOp: '<' | '<='
      rightToken: ValidRangeToken
    }
  | {
      leftToken: ValidRangeToken
      leftOp: '>' | '>='
      featureName: string
      rightOp: '>' | '>='
      rightToken: ValidRangeToken
    }
  | {
      leftToken: ValidRangeToken
      leftOp: '>' | '>=' | '<' | '<=' | '='
      featureName: string
      rightOp: null
      rightToken: null
    }
  | {
      leftToken: null
      leftOp: null
      featureName: string
      rightOp: '>' | '>=' | '<' | '<=' | '='
      rightToken: ValidRangeToken
    }

export const tokenizeRange = (tokens: ConvenientToken[]): ValidRange => {
  if (
    tokens.length < 5 ||
    tokens[0].type !== '<(-token>' ||
    tokens[tokens.length - 1].type !== '<)-token>'
  ) {
    throw new Error('Invalid range')
  }

  // range form
  const range: UncheckedRange = {
    leftToken: null,
    leftOp: null,
    featureName: '',
    rightOp: null,
    rightToken: null
  }

  const hasLeft =
    tokens[1].type === '<number-token>' ||
    tokens[1].type === '<dimension-token>' ||
    tokens[1].type === '<ratio-token>' ||
    (tokens[1].type === '<ident-token>' && tokens[1].value === 'infinite')
  if (tokens[2].type === '<delim-token>') {
    if (tokens[2].value === 0x003c) {
      if (
        tokens[3].type === '<delim-token>' &&
        tokens[3].value === 0x003d &&
        !tokens[3].wsBefore
      ) {
        range[hasLeft ? 'leftOp' : 'rightOp'] = '<='
      } else {
        range[hasLeft ? 'leftOp' : 'rightOp'] = '<'
      }
    } else if (tokens[2].value === 0x003e) {
      if (
        tokens[3].type === '<delim-token>' &&
        tokens[3].value === 0x003d &&
        !tokens[3].wsBefore
      ) {
        range[hasLeft ? 'leftOp' : 'rightOp'] = '>='
      } else {
        range[hasLeft ? 'leftOp' : 'rightOp'] = '>'
      }
    } else if (tokens[2].value === 0x003d) {
      range[hasLeft ? 'leftOp' : 'rightOp'] = '='
    } else {
      throw new Error('Invalid range')
    }

    if (hasLeft) {
      range.leftToken = tokens[1]
    } else if (tokens[1].type === '<ident-token>') {
      range.featureName = tokens[1].value
    } else {
      throw new Error('Invalid range')
    }

    const tokenIndexAfterFirstOp =
      2 + (range[hasLeft ? 'leftOp' : 'rightOp']?.length ?? 0)
    const tokenAfterFirstOp = tokens[tokenIndexAfterFirstOp]

    if (hasLeft) {
      if (tokenAfterFirstOp.type === '<ident-token>') {
        range.featureName = tokenAfterFirstOp.value

        if (tokens.length >= 7) {
          // check for right side
          const secondOpToken = tokens[tokenIndexAfterFirstOp + 1]
          const followingToken = tokens[tokenIndexAfterFirstOp + 2]
          if (secondOpToken.type === '<delim-token>') {
            const charCode = secondOpToken.value
            if (charCode === 0x003c) {
              if (
                followingToken.type === '<delim-token>' &&
                followingToken.value === 0x003d &&
                !followingToken.wsBefore
              ) {
                range.rightOp = '<='
              } else {
                range.rightOp = '<'
              }
            } else if (charCode === 0x003e) {
              if (
                followingToken.type === '<delim-token>' &&
                followingToken.value === 0x003d &&
                !followingToken.wsBefore
              ) {
                range.rightOp = '>='
              } else {
                range.rightOp = '>'
              }
            } else {
              throw new Error('Invalid range')
            }

            const tokenAfterSecondOp =
              tokens[tokenIndexAfterFirstOp + 1 + (range.rightOp?.length ?? 0)]

            range.rightToken = tokenAfterSecondOp
          } else {
            throw new Error('Invalid range')
          }
        } else if (tokenIndexAfterFirstOp + 2 !== tokens.length) {
          throw new Error('Invalid range')
        }
      } else {
        throw new Error('Invalid range')
      }
    } else {
      range.rightToken = tokenAfterFirstOp
    }

    let validRange: ValidRange | null = null

    const {
      leftToken: lt,
      leftOp,
      featureName,
      rightOp,
      rightToken: rt
    } = range

    let leftToken: ValidRangeToken | null = null
    if (lt !== null) {
      if (lt.type === '<ident-token>') {
        const { type, value } = lt
        if (value === 'infinite') {
          leftToken = { type, value }
        }
      } else if (
        lt.type === '<number-token>' ||
        lt.type === '<dimension-token>' ||
        lt.type === '<ratio-token>'
      ) {
        const { wsBefore: _0, wsAfter: _1, ...ltNoWS } = lt
        leftToken = ltNoWS
      }
    }
    let rightToken: ValidRangeToken | null = null
    if (rt !== null) {
      if (rt.type === '<ident-token>') {
        const { type, value } = rt
        if (value === 'infinite') {
          rightToken = { type, value }
        }
      } else if (
        rt.type === '<number-token>' ||
        rt.type === '<dimension-token>' ||
        rt.type === '<ratio-token>'
      ) {
        const { wsBefore: _0, wsAfter: _1, ...rtNoWS } = rt
        rightToken = rtNoWS
      }
    }

    if (leftToken !== null && rightToken !== null) {
      if (
        (leftOp === '<' || leftOp === '<=') &&
        (rightOp === '<' || rightOp === '<=')
      ) {
        validRange = { leftToken, leftOp, featureName, rightOp, rightToken }
      } else if (
        (leftOp === '>' || leftOp === '>=') &&
        (rightOp === '>' || rightOp === '>=')
      ) {
        validRange = { leftToken, leftOp, featureName, rightOp, rightToken }
      } else {
        throw new Error('Invalid range')
      }
    } else if (
      leftToken === null &&
      leftOp === null &&
      rightOp !== null &&
      rightToken !== null
    ) {
      validRange = { leftToken, leftOp, featureName, rightOp, rightToken }
    } else if (
      leftToken !== null &&
      leftOp !== null &&
      rightOp === null &&
      rightToken === null
    ) {
      validRange = { leftToken, leftOp, featureName, rightOp, rightToken }
    }

    return validRange as ValidRange
  } else {
    throw new Error('Invalid range')
  }
}

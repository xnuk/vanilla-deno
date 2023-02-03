/*! https://mths.be/cssesc v3.0.0 by @mathias */
// got from: https://github.com/mathiasbynens/cssesc/blob/cb894eb42f27c8d3cd793f16afe35b3ab38000a1/src/cssesc.js
"use strict"

interface Options {
	escapeEverything: boolean
	isIdentifier: boolean
	quotes: string
	wrap: boolean
}

const resolveOptions = (options: Readonly<Partial<Options>>): Options => ({
	escapeEverything: options.escapeEverything || false,
	isIdentifier: options.isIdentifier || false,
	quotes: options.quotes || "single",
	wrap: options.wrap || false,
})

const regexAnySingleEscape = /<%= anySingleEscape %>/
const regexSingleEscape = /<%= singleEscapes %>/
const regexExcessiveSpaces = /(^|\\+)?(\\[A-F0-9]{1,6})\x20(?![a-fA-F0-9\x20])/g

// https://mathiasbynens.be/notes/css-escapes#css
export const cssesc = (
	str: string,
	partialOptions: Readonly<Partial<Options>>,
) => {
	const options = resolveOptions(partialOptions)
	const quote = options.quotes == "double" ? '"' : "'"
	const isIdentifier = options.isIdentifier

	const firstChar = str.charAt(0)
	let output = ""
	let counter = 0
	const length = str.length
	while (counter < length) {
		const character = str.charAt(counter++)
		let codePoint = character.charCodeAt(0)
		let value
		// If it’s not a printable ASCII character…
		if (codePoint < 0x20 || codePoint > 0x7e) {
			if (
				codePoint >= 0xd800 &&
				codePoint <= 0xdbff &&
				counter < length
			) {
				// It’s a high surrogate, and there is a next character.
				const extra = str.charCodeAt(counter++)
				if ((extra & 0xfc00) == 0xdc00) {
					// next character is low surrogate
					codePoint = ((codePoint & 0x3ff) << 10) + (extra & 0x3ff) +
						0x10000
				} else {
					// It’s an unmatched surrogate; only append this code unit, in case
					// the next code unit is the high surrogate of a surrogate pair.
					counter--
				}
			}
			value = "\\" + codePoint.toString(16).toUpperCase() + " "
		} else {
			if (options.escapeEverything) {
				if (regexAnySingleEscape.test(character)) {
					value = "\\" + character
				} else {
					value = "\\" + codePoint.toString(16).toUpperCase() + " "
				}
				// deno-lint-ignore no-control-regex
			} else if (/[\t\n\f\r\x0B]/.test(character)) {
				value = "\\" + codePoint.toString(16).toUpperCase() + " "
			} else if (
				character == "\\" ||
				(!isIdentifier &&
					((character == '"' && quote == character) ||
						(character == "'" && quote == character))) ||
				(isIdentifier && regexSingleEscape.test(character))
			) {
				value = "\\" + character
			} else {
				value = character
			}
		}
		output += value
	}

	if (isIdentifier) {
		if (/^-[-\d]/.test(output)) {
			output = "\\-" + output.slice(1)
		} else if (/\d/.test(firstChar)) {
			output = "\\3" + firstChar + " " + output.slice(1)
		}
	}

	// Remove spaces after `\HEX` escapes that are not followed by a hex digit,
	// since they’re redundant. Note that this is only possible if the escape
	// sequence isn’t preceded by an odd number of backslashes.
	output = output.replace(regexExcessiveSpaces, function ($0, $1, $2) {
		if ($1 && $1.length % 2) {
			// It’s not safe to remove the space, so don’t.
			return $0
		}
		// Strip the space.
		return ($1 || "") + $2
	})

	if (!isIdentifier && options.wrap) {
		return quote + output + quote
	}
	return output
}

export default cssesc

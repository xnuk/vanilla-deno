// got from: https://github.com/BrunoRB/ahocorasick/blob/605f07f6879ab2beb609e39464bf0c220d63b1c8/src/main.js

export default class AhoCorasick {
	private gotoFn: Readonly<{ [key: number]: { [key: string]: number } }>
	private output: Readonly<{ [key: number]: string[] }>
	private failure: Readonly<{ [key: number]: number }>

	constructor(keywords: readonly string[]) {
		const gotoFn: { [key: number]: { [key: string]: number } } = {
			0: {},
		}
		const output: { [key: number]: string[] } = {}

		let state = 0
		for (const word of keywords) {
			let curr = 0
			for (const ch of word.split("")) {
				const current = (gotoFn[curr] ||= {})
				const value = current[ch]
				if (value != null) {
					curr = value
				} else {
					state++
					current[ch] = state
					gotoFn[state] = {}
					curr = state
					output[state] = []
				}
			}

			const outputCurr = (output[curr] ||= [])
			outputCurr.push(word)
		}

		const failure: { [key: number]: number } = {}
		const xs: number[] = []

		// f(s) = 0 for all states of depth 1 (the ones from which the 0 state can transition to)
		const first = gotoFn[0]
		if (first != null) {
			for (const state of Object.values(first)) {
				failure[state] = 0
				xs.push(state)
			}
		}

		let item: number | null | undefined = null
		while ((item = xs.shift()) != null) {
			const gfn = gotoFn[item]
			if (gfn == null) continue

			// for each symbol a such that g(r, a) = s
			for (const [l, s] of Object.entries(gfn)) {
				xs.push(s)

				// set state = f(r)
				let state = failure[item]
				while (
					state != null && state > 0 && (gotoFn[state]?.[l] == null)
				) {
					state = failure[state]
				}

				const fs = state != null ? gotoFn[state]?.[l] : null

				if (fs != null) {
					failure[s] = fs
					output[s] = (output[s] || []).concat(output[fs] || [])
				} else {
					failure[s] = 0
				}
			}
		}

		this.gotoFn = gotoFn
		this.output = output
		this.failure = failure
	}

	search(
		str: string,
	): readonly (readonly [endIndex: number, matches: readonly string[]])[] {
		let state = 0
		const results: (readonly [
			endIndex: number,
			matches: readonly string[],
		])[] = []
		for (let i = 0; i < str.length; i++) {
			const l = str[i] ?? ""
			while (state > 0 && this.gotoFn[state]?.[l] == null) {
				const fail = this.failure[state]
				if (fail == null) break
				state = fail
			}

			const next = this.gotoFn[state]?.[l]
			if (next == null) continue
			state = next

			const foundStrs = this.output[state]

			if (foundStrs != null && foundStrs.length > 0) {
				results.push([i, foundStrs])
			}
		}

		return results
	}
}

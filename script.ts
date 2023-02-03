const files = async (dir: string | URL) => {
	const res = []
	for await (const { isFile, name } of Deno.readDir(dir)) {
		if (
			!isFile || !name.endsWith(".ts") || name.endsWith(".test.ts") ||
			name.endsWith(".spec.ts")
		) {
			continue
		}
		res.push(new URL(name, dir))
	}

	return res
}

const commonPrefix = (a: string, b: string): string | null => {
	if (a === b) return a
	if (a[0] !== b[0]) return null
	const maxLen = a.length > b.length ? b.length : a.length

	let i = 0
	while (i < maxLen && a[i] === b[i]) i += 1

	return a.substring(0, i)
}

// Yes, this is naive.
export const relativePath = (
	fromUrl: URL,
	toUrl: URL,
): string => {
	const base = fromUrl.href
	const target = toUrl.href

	if (fromUrl.protocol !== toUrl.protocol || fromUrl.host !== toUrl.host) {
		return target
	}

	const prefix = commonPrefix(base, target)
	if (prefix == null) return target

	const commonFolderLen = prefix.lastIndexOf("/") + 1
	if (commonFolderLen === 0) return target

	const dots = [...base.substring(commonFolderLen)].filter((v) => v === "/")
		.length
	const path = target.substring(commonFolderLen)
	if (dots === 0) return `./${path}`
	return "../".repeat(dots) + path
}

const inplace =
	(shims: { readonly [pkg: string]: URL }) => (url: URL, dest: URL) =>
		Deno.readTextFile(url).then((file) =>
			file.replace(/from ['"]([^'"]+)['"];?/g, (_, p: string) => {
				if (p.startsWith("./") || p.startsWith("../")) {
					if (p.endsWith("/")) {
						p += "index.ts"
					} else if (!p.endsWith(".ts")) {
						p += ".ts"
					}
				} else if (p === "." || p === "..") {
					p += "/index.ts"
				} else {
					const resolved = shims[p]
					if (resolved != null) {
						p = relativePath(dest, resolved)
					} else {
						console.warn(
							`The package ${p} in ${url.pathname} could not be resolved.`,
						)
					}
				}
				return `from '${p}';`
			}).replaceAll("process.env.NODE_ENV", "'production'")
		).then((file) => Deno.writeTextFile(dest, file))

const setBase = (base: Readonly<URL>) => ({
	resolve: (v: string) => new URL(v, base),
	relative: (v: URL) => relativePath(base, v),
} as const)

const main = async () => {
	const { resolve, relative } = setBase(new URL("./bundle/", import.meta.url))
	const dist = new URL("./dist/", import.meta.url)
	const esmsh = "https://esm.sh/v106"

	const magic = inplace({
		"@vanilla-extract/private": new URL("./private/index.ts", dist),
		"@emotion/hash": new URL("./deps/emotion-hash.ts", dist),
		"outdent": new URL("https://deno.land/x/outdent@v0.8.0/src/index.ts"),
		"cssesc": new URL("./deps/cssesc.ts", dist),
		"csstype": new URL(`${esmsh}/csstype@3.1.1`),
		"chalk": new URL("./deps/chalk.ts", dist),
		"css-what": new URL("./css-what/parse.ts", dist),
		"media-query-parser": new URL(
			"./media-query-parser/syntacticAnalysis.ts",
			dist,
		),
		"deepmerge": new URL(`${esmsh}/deepmerge@4.3.0`),
		"ahocorasick": new URL("./deps/ahocorasick.ts", dist),
		"deep-object-diff": new URL(
			`${esmsh}/deep-object-diff@1.1.9`,
		),
	})

	await Deno.mkdir(dist)

	await Promise.all(([
		"css",
		"private",
		"css-what",
		"media-query-parser",
		"deps",
	] as const).map(async (folder) => {
		const path = `./${folder}/` as const
		const mkdir = Deno.mkdir(new URL(path, dist))
		const func = folder === "deps" ? Deno.copyFile : magic
		const fs = files(resolve(path))

		await mkdir
		const urls = await fs

		return Promise.all(
			urls.map((url) => func(url, new URL(relative(url), dist))),
		)
	}))
}

if (import.meta.main) {
	main()
}

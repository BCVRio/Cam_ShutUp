--!nocheck
-- Test runner for Lune (https://lune-org.github.io/docs).
--   lune run tests/run
--
-- 1. Syntax-compiles every .luau file under src/ (catches typos before Studio does).
-- 2. Loads the Roblox-free shared modules with a fake `script`/`require` and runs the specs
--    in tests/specs/*.spec.luau.

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local stdio = require("@lune/stdio")

local ROOT = "."
local failures = 0
local passes = 0

local function green(s)
	return stdio.color("green") .. s .. stdio.color("reset")
end
local function red(s)
	return stdio.color("red") .. s .. stdio.color("reset")
end

-- ───────────────────────── 1. compile everything ─────────────────────────

local function walk(dir: string, out: { string })
	for _, name in fs.readDir(dir) do
		local path = dir .. "/" .. name
		if fs.isDir(path) then
			walk(path, out)
		elseif name:match("%.luau$") then
			table.insert(out, path)
		end
	end
end

local sources = {}
walk(ROOT .. "/src", sources)
table.sort(sources)

print("Compiling " .. #sources .. " source files...")
for _, path in sources do
	local src = fs.readFile(path)
	local ok, err = pcall(function()
		luau.compile(src, { optimizationLevel = 1, debugLevel = 1 })
	end)
	if ok then
		passes += 1
	else
		failures += 1
		print(red("  SYNTAX ERROR ") .. path .. "\n    " .. tostring(err))
	end
end
print(green("  compiled OK: ") .. tostring(#sources - failures) .. "/" .. #sources)

-- ───────────────────────── 2. shared-module harness ─────────────────────────

-- Fake `script` tree so `require(script.Parent.Rarity)` resolves to src/shared/Rarity.luau
local cache = {}

local function makeScriptProxy(path: string)
	return setmetatable({ __path = path }, {
		__index = function(self, key)
			if key == "Parent" then
				local parent = path:gsub("/[^/]+$", "")
				return makeScriptProxy(parent)
			end
			return makeScriptProxy(path .. "/" .. key)
		end,
	})
end

local function loadModule(path: string)
	if not path:match("%.luau$") then
		path = path .. ".luau"
	end
	if cache[path] ~= nil then
		return cache[path]
	end
	local src = fs.readFile(path)
	local env = setmetatable({
		script = makeScriptProxy(path:gsub("%.luau$", "")),
		require = function(target)
			if type(target) == "table" and target.__path then
				return loadModule(target.__path)
			end
			return require(target)
		end,
	}, { __index = _G })
	local fn = luau.load(src, { debugName = path, environment = env })
	local result = fn()
	cache[path] = result
	return result
end

-- ───────────────────────── 3. specs ─────────────────────────

local specDir = ROOT .. "/tests/specs"
local specs = {}
if fs.isDir(specDir) then
	for _, name in fs.readDir(specDir) do
		if name:match("%.spec%.luau$") then
			table.insert(specs, specDir .. "/" .. name)
		end
	end
end
table.sort(specs)

local function expect(cond: boolean, msg: string)
	if cond then
		passes += 1
	else
		failures += 1
		print(red("  FAIL ") .. msg)
	end
end

for _, specPath in specs do
	print("\n" .. specPath)
	local src = fs.readFile(specPath)
	local env = setmetatable({
		load = loadModule,
		expect = expect,
	}, { __index = _G })
	local ok, err = pcall(function()
		luau.load(src, { debugName = specPath, environment = env })()
	end)
	if not ok then
		failures += 1
		print(red("  ERROR ") .. tostring(err))
	end
end

print(string.format("\n%s passed, %s failed", green(tostring(passes)), failures > 0 and red(tostring(failures)) or "0"))
process.exit(failures > 0 and 1 or 0)

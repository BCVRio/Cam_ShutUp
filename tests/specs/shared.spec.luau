--!nocheck
-- Specs for the Roblox-free shared modules. `load` and `expect` are injected by tests/run.luau.

local Config = load("src/shared/Config")
local Rarity = load("src/shared/Rarity")
local Format = load("src/shared/Format")
local Collectibles = load("src/shared/Collectibles")

-- ── Config ──
expect(Config.SlotsPerPlot == Config.SlotRows * Config.SlotCols, "SlotsPerPlot derived from rows*cols")
expect(Config.PlotCount % 2 == 0, "PlotCount must be even (two rows)")
expect(Config.BaseLock.Cooldown > Config.BaseLock.Duration, "lock cooldown longer than lock duration")
expect(Config.StealHoldSeconds > Config.OwnerPickupHoldSeconds, "stealing is slower than own pickup")
-- plots must fit on the ground
local M = Config.Map
local rowWidth = (Config.PlotCount / 2) * M.PlotSize + (Config.PlotCount / 2 - 1) * M.PlotGap
-- Nunhead Green sits at x = -Ground/2 + Radius + 12 (see MapBuilder); its east edge must clear the first plot
local greenEastEdge = -M.GroundSize / 2 + 2 * M.GreenRadius + 12
expect(-rowWidth / 2 > greenEastEdge + 4, "plot rows clear Nunhead Green")
expect(rowWidth / 2 < M.GroundSize / 2 - 140, "plot rows leave room for the Cemetery")
expect(M.PlotRowOffset - M.PlotDepth / 2 > M.RoadWidth / 2 + 10, "plots sit behind the pavement")
-- pedestal grid fits inside the plot
expect((Config.SlotCols - 1) * Config.SlotSpacing + 6 < M.PlotSize, "pedestal grid narrower than plot")
expect((Config.SlotRows - 1) * (Config.SlotSpacing + 2) + 14 < M.PlotDepth, "pedestal rows fit inside plot depth")

-- ── Rarity ──
expect(#Rarity.Order == 6, "six rarity tiers")
local prevWeight = math.huge
for _, name in Rarity.Order do
	local info = Rarity.get(name)
	expect(info.Weight < prevWeight, "weights strictly decrease: " .. name)
	prevWeight = info.Weight
	expect(#info.ColorRGB == 3, "colour has 3 channels: " .. name)
end
-- deterministic rolls
expect(Rarity.roll(function() return 0 end) == "Common", "roll(0) is Common")
expect(Rarity.roll(function() return 0.999999 end) == "Mythic", "roll(~1) is Mythic")
-- luck boosts rare tiers without touching Common
local base = Rarity.weightsWithLuck(0)
local lucky = Rarity.weightsWithLuck(1)
expect(lucky.Common == base.Common, "luck leaves Common weight alone")
expect(lucky.Mythic > base.Mythic, "luck boosts Mythic")
-- distribution sanity: 20k rolls, Common should be the majority and Mythic < 2%
do
	local seed = 12345
	local function rnd()
		seed = (seed * 1103515245 + 12345) % 2147483648
		return seed / 2147483648
	end
	local counts = {}
	local N = 20000
	for _ = 1, N do
		local r = Rarity.roll(rnd)
		counts[r] = (counts[r] or 0) + 1
	end
	expect((counts.Common or 0) / N > 0.45, "Common is roughly half of spawns")
	expect((counts.Mythic or 0) / N < 0.02, "Mythic is under 2% of spawns")
	expect((counts.Legendary or 0) > 0, "Legendary does spawn")
end

-- ── Format ──
expect(Format.cash(0) == "£0", "cash 0 -> " .. Format.cash(0))
expect(Format.cash(950) == "£950", "cash 950 -> " .. Format.cash(950))
expect(Format.cash(1000) == "£1K", "cash 1000 -> " .. Format.cash(1000))
expect(Format.cash(1234) == "£1.23K", "cash 1234 -> " .. Format.cash(1234))
expect(Format.cash(15500) == "£15.5K", "cash 15500 -> " .. Format.cash(15500))
expect(Format.cash(150000) == "£150K", "cash 150000 -> " .. Format.cash(150000))
expect(Format.cash(2500000) == "£2.5M", "cash 2.5M -> " .. Format.cash(2500000))
expect(Format.cash(-40) == "-£40", "negative cash -> " .. Format.cash(-40))
expect(Format.income(7) == "£7/s", "income -> " .. Format.income(7))
expect(Format.clock(125) == "2:05", "clock 125 -> " .. Format.clock(125))
expect(Format.clock(0) == "0:00", "clock 0 -> " .. Format.clock(0))

-- ── Collectibles ──
expect(#Collectibles.List >= 30, "at least 30 collectibles")
for _, name in Rarity.Order do
	expect(Collectibles.ByRarity[name] and #Collectibles.ByRarity[name] >= 3, "at least 3 items of rarity " .. name)
end
local seenNames = {}
for _, item in Collectibles.List do
	expect(type(item.Id) == "string" and item.Id:match("^[a-z0-9_]+$") ~= nil, "id is snake_case: " .. tostring(item.Id))
	expect(not seenNames[item.Name], "unique name: " .. item.Name)
	seenNames[item.Name] = true
	expect(item.Price > 0 and item.Income > 0, "positive price & income: " .. item.Id)
	expect(Rarity.Info[item.Rarity] ~= nil, "valid rarity: " .. item.Id)
	expect(type(item.Blurb) == "string" and #item.Blurb > 0, "has blurb: " .. item.Id)
	expect(type(item.Visual.Builder) == "string", "has builder: " .. item.Id)
	expect(#item.Visual.Primary == 3, "primary colour: " .. item.Id)
	-- payback time between 15s and 60s so cheap things feel snappy and rares feel like investments
	local payback = item.Price / item.Income
	expect(payback >= 15 and payback <= 60, string.format("payback %.0fs in range for %s", payback, item.Id))
end
-- rarer tiers earn more than the tier below (max of lower < min of upper)
for i = 2, #Rarity.Order do
	local lower, upper = Rarity.Order[i - 1], Rarity.Order[i]
	local maxLower, minUpper = 0, math.huge
	for _, it in Collectibles.ByRarity[lower] do
		maxLower = math.max(maxLower, it.Income)
	end
	for _, it in Collectibles.ByRarity[upper] do
		minUpper = math.min(minUpper, it.Income)
	end
	expect(minUpper > maxLower, upper .. " always out-earns " .. lower)
end
-- deterministic spawn
local it = Collectibles.rollSpawn(function() return 0 end)
expect(it.Rarity == "Common", "rollSpawn(0) gives a Common")
expect(Collectibles.get("mega_fox") ~= nil, "MEGA FOX exists, obviously")
expect(Collectibles.get("nope") == nil, "unknown id -> nil")

--!strict
-- Rarity tiers, their spawn weights and display colours.
-- Colours are stored as {r, g, b} 0-255 so this module stays Roblox-free for tests.

export type RarityName = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic"

export type RarityInfo = {
	Name: RarityName,
	Weight: number,
	ColorRGB: { number },
	Label: string,
	Glow: boolean,
}

local Rarity = {}

Rarity.Order = ({ "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic" } :: { RarityName })

Rarity.Info = ({
	Common = { Name = "Common", Weight = 52, ColorRGB = { 190, 190, 190 }, Label = "Common", Glow = false },
	Uncommon = { Name = "Uncommon", Weight = 26, ColorRGB = { 86, 204, 96 }, Label = "Uncommon", Glow = false },
	Rare = { Name = "Rare", Weight = 13, ColorRGB = { 66, 140, 255 }, Label = "Rare", Glow = false },
	Epic = { Name = "Epic", Weight = 6, ColorRGB = { 176, 86, 255 }, Label = "Epic", Glow = true },
	Legendary = { Name = "Legendary", Weight = 2.4, ColorRGB = { 255, 176, 0 }, Label = "Legendary", Glow = true },
	Mythic = { Name = "Mythic", Weight = 0.6, ColorRGB = { 255, 64, 128 }, Label = "MYTHIC", Glow = true },
} :: { [string]: RarityInfo })

function Rarity.get(name: string): RarityInfo
	local info = Rarity.Info[name]
	assert(info, "Unknown rarity: " .. tostring(name))
	return info
end

function Rarity.index(name: string): number
	for i, n in Rarity.Order do
		if n == name then
			return i
		end
	end
	error("Unknown rarity: " .. tostring(name))
end

-- Returns a copy of the weights with a luck multiplier applied to the rarer tiers.
-- luck = 0 -> base weights. luck = 1 -> rare tiers are roughly twice as likely.
function Rarity.weightsWithLuck(luck: number): { [string]: number }
	local out = {}
	for i, name in Rarity.Order do
		local base = Rarity.Info[name].Weight
		-- Common is unaffected, each tier above gets a bigger boost.
		local boost = 1 + luck * (i - 1) * 0.35
		out[name] = base * boost
	end
	return out
end

-- Weighted roll. `random` is a function returning a number in [0, 1) so tests can inject a fake.
function Rarity.roll(random: () -> number, luck: number?): RarityName
	local weights = Rarity.weightsWithLuck(luck or 0)
	local total = 0
	for _, name in Rarity.Order do
		total += weights[name]
	end
	local r = random() * total
	local acc = 0
	for _, name in Rarity.Order do
		acc += weights[name]
		if r < acc then
			return name
		end
	end
	return Rarity.Order[#Rarity.Order]
end

return Rarity

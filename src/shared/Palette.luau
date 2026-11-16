--!strict
-- Tiny helpers for turning {r,g,b} tables into Color3 (Roblox side only).

local Palette = {}

function Palette.rgb(t: { number }): Color3
	return Color3.fromRGB(t[1], t[2], t[3])
end

function Palette.darken(t: { number }, amount: number): Color3
	local f = 1 - amount
	return Color3.fromRGB(math.floor(t[1] * f), math.floor(t[2] * f), math.floor(t[3] * f))
end


return Palette

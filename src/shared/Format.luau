--!strict
-- Number / time formatting helpers shared by server and client.

local Format = {}

local SUFFIXES = { "", "K", "M", "B", "T", "Qa", "Qi" }

-- 1234 -> "1.23K", 950 -> "950", 1500000 -> "1.5M"
function Format.cash(n: number): string
	if n ~= n then
		return "0"
	end
	local negative = n < 0
	n = math.abs(n)
	local idx = 1
	while n >= 1000 and idx < #SUFFIXES do
		n /= 1000
		idx += 1
	end
	local s: string
	if idx == 1 then
		s = tostring(math.floor(n + 0.5))
	elseif n >= 100 then
		s = string.format("%d", math.floor(n + 0.5))
	elseif n >= 10 then
		s = string.format("%.1f", n):gsub("%.0$", "")
	else
		s = string.format("%.2f", n):gsub("0+$", ""):gsub("%.$", "")
	end
	return (negative and "-" or "") .. "£" .. s .. SUFFIXES[idx]
end

-- income per second -> "£1.5K/s"
function Format.income(perSecond: number): string
	return Format.cash(perSecond) .. "/s"
end

-- 125 -> "2:05"
function Format.clock(seconds: number): string
	seconds = math.max(0, math.floor(seconds + 0.5))
	local m = seconds // 60
	local s = seconds % 60
	return string.format("%d:%02d", m, s)
end

return Format

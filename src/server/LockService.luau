--!strict
-- Base shield: lock your doorway for a while so nobody can get in and nick stuff.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Format = require(Shared.Format)
local Remotes = require(Shared.Remotes)

local PlotService = require(script.Parent.PlotService)

local LockService = {}

local function sendState(plot: PlotService.Plot)
	if plot.Owner then
		local now = os.clock()
		Remotes.get(Remotes.Names.LockState):FireClient(
			plot.Owner,
			math.max(0, plot.LockedUntil - now),
			math.max(0, plot.CooldownUntil - now)
		)
	end
end

local function setDoor(plot: PlotService.Plot, locked: boolean)
	plot.Door.CanCollide = locked
	plot.Door.Transparency = locked and 0.35 or 1
	plot.Door.CanQuery = locked
	local light = plot.Model:FindFirstChild("LockLight")
	if light and light:IsA("BasePart") then
		light.Color = locked and Color3.fromRGB(255, 80, 80) or Color3.fromRGB(80, 220, 120)
	end
	plot.Model:SetAttribute("Locked", locked)
end

function LockService.tryLock(player: Player): boolean
	local plot = PlotService.getPlotFor(player)
	if not plot then
		return false
	end
	local now = os.clock()
	if now < plot.LockedUntil then
		return false
	end
	if now < plot.CooldownUntil then
		Remotes.get(Remotes.Names.Notify):FireClient(player, "Shield recharging: " .. Format.clock(plot.CooldownUntil - now), "bad")
		Remotes.get(Remotes.Names.PlaySound):FireClient(player, "Deny")
		return false
	end
	plot.LockedUntil = now + Config.BaseLock.Duration
	plot.CooldownUntil = plot.LockedUntil + Config.BaseLock.Cooldown
	setDoor(plot, true)
	sendState(plot)
	Remotes.get(Remotes.Names.PlaySound):FireClient(player, "Lock")
	Remotes.get(Remotes.Names.Notify):FireClient(player, "Base locked for " .. Config.BaseLock.Duration .. "s", "good")

	task.delay(Config.BaseLock.Duration, function()
		-- Only unlock if nobody re-locked in between (they can't, but be safe)
		if os.clock() >= plot.LockedUntil - 0.05 then
			setDoor(plot, false)
			sendState(plot)
		end
	end)
	return true
end

function LockService.init()
	for _, plot in PlotService.getPlots() do
		setDoor(plot, false)
		plot.LockPrompt.Triggered:Connect(function(player)
			if plot.Owner == player then
				LockService.tryLock(player)
			end
		end)
	end
	Remotes.get(Remotes.Names.RequestLock).OnServerEvent:Connect(function(player)
		LockService.tryLock(player)
	end)
	PlotService.onAssigned(function(_player, plot)
		setDoor(plot, false)
		sendState(plot)
	end)
	PlotService.onReleased(function(_player, plot)
		setDoor(plot, false)
	end)
end

return LockService

--!strict
-- Client-side tweaks for the player's own plot:
--   * the shield door never blocks its owner (local CanCollide = false, re-applied on replication)
--   * pedestal prompts read "Pick up" with a short hold instead of "Steal"

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)

local PlotClient = {}

local player = Players.LocalPlayer
local myPlot: Model? = nil
local connections: { RBXScriptConnection } = {}

local function clear()
	for _, c in connections do
		c:Disconnect()
	end
	table.clear(connections)
end

local function applyOwnerView(plot: Model)
	local door = plot:WaitForChild("Door", 5)
	if door and door:IsA("BasePart") then
		door.CanCollide = false
		table.insert(connections, door:GetPropertyChangedSignal("CanCollide"):Connect(function()
			if door.CanCollide then
				door.CanCollide = false
			end
		end))
		-- Tint our own shield a friendly green so we can tell it apart
		door.Color = Color3.fromRGB(120, 255, 170)
	end

	for _, d in plot:GetDescendants() do
		if d:IsA("ProximityPrompt") and d.Parent and d.Parent.Name:match("^Pedestal_") then
			d.ActionText = "Pick up"
			d.HoldDuration = Config.OwnerPickupHoldSeconds
		end
	end
	table.insert(connections, plot.DescendantAdded:Connect(function(d)
		if d:IsA("ProximityPrompt") and d.Parent and d.Parent.Name:match("^Pedestal_") then
			d.ActionText = "Pick up"
			d.HoldDuration = Config.OwnerPickupHoldSeconds
		end
	end))
end

function PlotClient.getMyPlot(): Model?
	return myPlot
end

function PlotClient.init()
	Remotes.get(Remotes.Names.PlotAssigned).OnClientEvent:Connect(function(plotModel: Model, _index: number)
		clear()
		myPlot = plotModel
		applyOwnerView(plotModel)
	end)

	-- In case the server assigned before this script ran: look for a plot with our UserId
	task.defer(function()
		if myPlot then
			return
		end
		local plots = workspace:FindFirstChild("Plots")
		if plots then
			for _, m in plots:GetChildren() do
				if m:IsA("Model") and m:GetAttribute("OwnerUserId") == player.UserId then
					myPlot = m
					applyOwnerView(m)
					break
				end
			end
		end
	end)
end

return PlotClient

--!strict
-- Lazily creates / fetches RemoteEvents in ReplicatedStorage.Remotes.
-- Server calls Remotes.init() once; clients just call Remotes.get(name).

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Remotes = {}

Remotes.Names = {
	-- Server -> Client
	Notify = "Notify", -- (message: string, kind: "info"|"good"|"bad"|"steal")
	PlotAssigned = "PlotAssigned", -- (plotModel: Model, plotIndex: number)
	CarryChanged = "CarryChanged", -- (itemName: string?, rarity: string?)
	LockState = "LockState", -- (lockedUntil: number, cooldownUntil: number)  server clock
	PlaySound = "PlaySound", -- (soundKey: string, position: Vector3?)
	RareSpawn = "RareSpawn", -- (itemName: string, rarity: string)

	-- Client -> Server
	RequestLock = "RequestLock",
	RequestSell = "RequestSell", -- (slotIndex: number)
}

local folder: Folder? = nil

local function getFolder(): Folder
	if folder then
		return folder
	end
	local existing = ReplicatedStorage:FindFirstChild("Remotes")
	if existing then
		folder = existing :: Folder
		return folder :: Folder
	end
	if RunService:IsServer() then
		local f = Instance.new("Folder")
		f.Name = "Remotes"
		f.Parent = ReplicatedStorage
		folder = f
		return f
	end
	folder = ReplicatedStorage:WaitForChild("Remotes") :: Folder
	return folder :: Folder
end

function Remotes.init()
	assert(RunService:IsServer(), "Remotes.init is server-only")
	local f = getFolder()
	for _, name in Remotes.Names do
		if not f:FindFirstChild(name) then
			local ev = Instance.new("RemoteEvent")
			ev.Name = name
			ev.Parent = f
		end
	end
end

function Remotes.get(name: string): RemoteEvent
	local f = getFolder()
	if RunService:IsServer() then
		local ev = f:FindFirstChild(name)
		if not ev then
			ev = Instance.new("RemoteEvent")
			ev.Name = name
			ev.Parent = f
		end
		return ev :: RemoteEvent
	end
	return f:WaitForChild(name) :: RemoteEvent
end

return Remotes

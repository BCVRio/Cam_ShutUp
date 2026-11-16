--!strict
-- Everyone gets a cricket bat. Whack a thief and they drop what they're carrying.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)

local CarryService = require(script.Parent.CarryService)

local BatService = {}

local lastSwing: { [Player]: number } = {}
local stunned: { [Player]: boolean } = {}

local function buildBat(): Tool
	local tool = Instance.new("Tool")
	tool.Name = "Cricket Bat"
	tool.ToolTip = "Whack a thief to make them drop the goods"
	tool.CanBeDropped = false
	tool.RequiresHandle = true
	tool.Grip = CFrame.new(0, -0.9, 0) * CFrame.Angles(0, 0, math.rad(0))

	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(0.5, 1.6, 0.5)
	handle.Color = Color3.fromRGB(40, 40, 45)
	handle.Material = Enum.Material.Fabric
	handle.CanCollide = false
	handle.Massless = true
	handle.Parent = tool

	local blade = Instance.new("Part")
	blade.Name = "Blade"
	blade.Size = Vector3.new(1.1, 2.6, 0.45)
	blade.Color = Color3.fromRGB(220, 190, 130)
	blade.Material = Enum.Material.Wood
	blade.CanCollide = false
	blade.Massless = true
	blade.CFrame = handle.CFrame * CFrame.new(0, 2.0, 0)
	blade.Parent = tool
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = handle
	weld.Part1 = blade
	weld.Parent = blade

	local stripe = Instance.new("Part")
	stripe.Name = "Stripe"
	stripe.Size = Vector3.new(1.15, 0.3, 0.5)
	stripe.Color = Color3.fromRGB(200, 30, 30)
	stripe.CanCollide = false
	stripe.Massless = true
	stripe.CFrame = handle.CFrame * CFrame.new(0, 1.0, 0)
	stripe.Parent = tool
	local weld2 = Instance.new("WeldConstraint")
	weld2.Part0 = handle
	weld2.Part1 = stripe
	weld2.Parent = stripe

	return tool
end

local function swing(player: Player)
	local now = os.clock()
	if (lastSwing[player] or 0) + Config.Bat.Cooldown > now then
		return
	end
	lastSwing[player] = now

	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root or not root:IsA("BasePart") then
		return
	end

	local hitSomeone = false
	for _, other in Players:GetPlayers() do
		if other == player then
			continue
		end
		local oc = other.Character
		local oroot = oc and oc:FindFirstChild("HumanoidRootPart")
		local ohum = oc and oc:FindFirstChildOfClass("Humanoid")
		if not oroot or not oroot:IsA("BasePart") or not ohum or ohum.Health <= 0 then
			continue
		end
		local offset = oroot.Position - root.Position
		if offset.Magnitude > Config.Bat.Range then
			continue
		end
		local flat = Vector3.new(offset.X, 0, offset.Z)
		if flat.Magnitude > 0.1 and root.CFrame.LookVector:Dot(flat.Unit) < 0.2 then
			continue -- behind us
		end

		hitSomeone = true
		-- Knockback
		local dir = (flat.Magnitude > 0.1 and flat.Unit or root.CFrame.LookVector)
		oroot.AssemblyLinearVelocity = dir * Config.Bat.KnockbackForce + Vector3.new(0, 25, 0)

		-- Stun
		if not stunned[other] then
			stunned[other] = true
			local prev = ohum.WalkSpeed
			ohum.WalkSpeed = 0
			ohum.JumpPower = 0
			task.delay(Config.Bat.StunSeconds, function()
				stunned[other] = nil
				if ohum.Parent then
					ohum.WalkSpeed = prev > 0 and prev or (game:GetService("StarterPlayer") :: StarterPlayer).CharacterWalkSpeed
					ohum.JumpPower = (game:GetService("StarterPlayer") :: StarterPlayer).CharacterJumpPower
				end
			end)
		end

		-- Drop the goods
		if CarryService.isCarrying(other) then
			CarryService.dropCarried(other)
			Remotes.get(Remotes.Names.Notify):FireClient(player, "You clobbered " .. other.DisplayName .. "!", "good")
		end
		Remotes.get(Remotes.Names.PlaySound):FireClient(other, "Whack")
	end

	Remotes.get(Remotes.Names.PlaySound):FireClient(player, hitSomeone and "Whack" or "Click")
end

local function giveBat(player: Player, character: Model)
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not backpack then
		return
	end
	if backpack:FindFirstChild("Cricket Bat") or character:FindFirstChild("Cricket Bat") then
		return
	end
	local bat = buildBat()
	bat.Activated:Connect(function()
		swing(player)
	end)
	bat.Parent = backpack
end

function BatService.init()
	local function onPlayer(player: Player)
		player.CharacterAdded:Connect(function(character)
			task.wait(0.2)
			giveBat(player, character)
		end)
		if player.Character then
			giveBat(player, player.Character)
		end
	end
	Players.PlayerAdded:Connect(onPlayer)
	for _, p in Players:GetPlayers() do
		onPlayer(p)
	end
	Players.PlayerRemoving:Connect(function(player)
		lastSwing[player] = nil
		stunned[player] = nil
	end)
end

return BatService

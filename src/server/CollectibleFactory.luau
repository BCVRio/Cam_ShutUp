--!strict
-- Builds the physical Model for a collectible out of primitive parts (or a MeshPart
-- when a mesh id has been uploaded). Every model has:
--   PrimaryPart "Root"  - small invisible part at the base centre, used for pivoting/welding
--   Attribute ItemId    - collectible id
--   Attribute Rarity    - rarity name
--   "Label" BillboardGui showing name + rarity (hidden while carried)

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local AssetService = game:GetService("AssetService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Collectibles = require(Shared.Collectibles)
local Rarity = require(Shared.Rarity)
local Palette = require(Shared.Palette)
local Assets = require(Shared.Assets)

local CollectibleFactory = {}

type Visual = Collectibles.Visual

local UNIT = 3 -- studs: height of a scale-1 item

-- MeshId cannot be assigned on a script-made MeshPart, so meshes come from
-- AssetService:CreateMeshPartAsync (yields) and are cached as templates to clone.
local meshTemplates: { [string]: MeshPart | false } = {}

local function getMeshTemplate(meshId: string): MeshPart?
	local cached = meshTemplates[meshId]
	if cached ~= nil then
		return cached or nil
	end
	local ok, result = pcall(function()
		return AssetService:CreateMeshPartAsync(Content.fromUri(meshId), {
			CollisionFidelity = Enum.CollisionFidelity.Box,
			RenderFidelity = Enum.RenderFidelity.Automatic,
		})
	end)
	if ok and result then
		meshTemplates[meshId] = result
		return result
	end
	warn("[CollectibleFactory] mesh load failed for", meshId, result)
	meshTemplates[meshId] = false
	return nil
end

local function rgb(t: { number }?, fallback: { number }): Color3
	return Palette.rgb(t or fallback)
end

-- Adds a part to the model. `offset` is relative to the root (origin = base centre, +Y up).
local function addPart(
	model: Model,
	shape: Enum.PartType | "Wedge",
	size: Vector3,
	offset: CFrame,
	color: Color3,
	material: Enum.Material?,
	transparency: number?
): BasePart
	local p: BasePart
	if shape == "Wedge" then
		p = Instance.new("WedgePart")
	else
		local part = Instance.new("Part")
		part.Shape = shape :: Enum.PartType
		p = part
	end
	p.Size = size
	p.CFrame = offset
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.Transparency = transparency or 0
	p.Anchored = false
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Massless = true
	p.CastShadow = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = model
	return p
end

local function cf(x: number, y: number, z: number, rx: number?, ry: number?, rz: number?): CFrame
	local c = CFrame.new(x, y, z)
	if rx or ry or rz then
		c = c * CFrame.Angles(math.rad(rx or 0), math.rad(ry or 0), math.rad(rz or 0))
	end
	return c
end

-- ───────────────────────── Builders ─────────────────────────
-- Each builder draws at scale 1 (about UNIT studs tall) and returns the model height.

type Builder = (model: Model, v: Visual, s: number) -> number
local Builders: { [string]: Builder } = {}

Builders.Animal = function(model, v, s)
	local body = rgb(v.Primary, { 200, 120, 40 })
	local belly = rgb(v.Secondary, { 240, 230, 210 })
	local dark = rgb(v.Accent, { 30, 30, 30 })
	local B = Enum.PartType.Block
	local S = Enum.PartType.Ball
	-- body
	addPart(model, B, Vector3.new(1.6, 1.3, 2.6) * s, cf(0, 1.3 * s, 0), body)
	addPart(model, B, Vector3.new(1.2, 0.6, 2.0) * s, cf(0, 0.95 * s, 0), belly)
	-- head
	addPart(model, B, Vector3.new(1.3, 1.1, 1.2) * s, cf(0, 2.2 * s, 1.5 * s), body)
	addPart(model, B, Vector3.new(0.6, 0.5, 0.6) * s, cf(0, 2.0 * s, 2.3 * s), belly) -- snout
	addPart(model, S, Vector3.new(0.25, 0.25, 0.25) * s, cf(0, 2.0 * s, 2.62 * s), dark) -- nose
	-- ears
	addPart(model, "Wedge", Vector3.new(0.35, 0.6, 0.4) * s, cf(-0.4 * s, 2.95 * s, 1.4 * s), body)
	addPart(model, "Wedge", Vector3.new(0.35, 0.6, 0.4) * s, cf(0.4 * s, 2.95 * s, 1.4 * s), body)
	-- eyes
	addPart(model, S, Vector3.new(0.22, 0.22, 0.22) * s, cf(-0.35 * s, 2.4 * s, 2.1 * s), dark)
	addPart(model, S, Vector3.new(0.22, 0.22, 0.22) * s, cf(0.35 * s, 2.4 * s, 2.1 * s), dark)
	-- legs
	for _, x in { -0.55, 0.55 } do
		for _, z in { -0.9, 0.9 } do
			addPart(model, B, Vector3.new(0.4, 0.7, 0.4) * s, cf(x * s, 0.35 * s, z * s), dark)
		end
	end
	-- tail
	addPart(model, B, Vector3.new(0.5, 0.5, 1.4) * s, cf(0, 1.6 * s, -1.9 * s, 25, 0, 0), body)
	addPart(model, S, Vector3.new(0.55, 0.55, 0.55) * s, cf(0, 1.95 * s, -2.55 * s), belly)
	return 3.3 * s
end

Builders.Bird = function(model, v, s)
	local body = rgb(v.Primary, { 150, 150, 160 })
	local wing = rgb(v.Secondary, { 110, 110, 130 })
	local beak = rgb(v.Accent, { 230, 130, 40 })
	local S = Enum.PartType.Ball
	local B = Enum.PartType.Block
	addPart(model, S, Vector3.new(1.3, 1.1, 1.7) * s, cf(0, 1.0 * s, 0), body)
	addPart(model, S, Vector3.new(0.8, 0.8, 0.8) * s, cf(0, 1.75 * s, 0.7 * s), body)
	addPart(model, "Wedge", Vector3.new(0.3, 0.3, 0.6) * s, cf(0, 1.65 * s, 1.3 * s, -90, 0, 0), beak)
	addPart(model, B, Vector3.new(0.2, 0.6, 1.1) * s, cf(-0.7 * s, 1.05 * s, -0.1 * s, 0, 0, 15), wing)
	addPart(model, B, Vector3.new(0.2, 0.6, 1.1) * s, cf(0.7 * s, 1.05 * s, -0.1 * s, 0, 0, -15), wing)
	addPart(model, "Wedge", Vector3.new(0.6, 0.2, 0.9) * s, cf(0, 1.0 * s, -1.1 * s, 0, 180, 0), wing)
	for _, x in { -0.25, 0.25 } do
		addPart(model, B, Vector3.new(0.12, 0.5, 0.12) * s, cf(x * s, 0.25 * s, 0.1 * s), beak)
		addPart(model, B, Vector3.new(0.35, 0.08, 0.5) * s, cf(x * s, 0.04 * s, 0.25 * s), beak)
	end
	addPart(model, S, Vector3.new(0.15, 0.15, 0.15) * s, cf(-0.25 * s, 1.9 * s, 1.0 * s), Color3.new(0, 0, 0))
	addPart(model, S, Vector3.new(0.15, 0.15, 0.15) * s, cf(0.25 * s, 1.9 * s, 1.0 * s), Color3.new(0, 0, 0))
	return 2.2 * s
end

Builders.Cup = function(model, v, s)
	local cup = rgb(v.Primary, { 240, 240, 240 })
	local coffee = rgb(v.Secondary, { 120, 80, 50 })
	local C = Enum.PartType.Cylinder
	addPart(model, C, Vector3.new(2.0, 1.6, 1.6) * s, cf(0, 1.0 * s, 0, 0, 0, 90), cup)
	addPart(model, C, Vector3.new(0.1, 1.4, 1.4) * s, cf(0, 2.0 * s, 0, 0, 0, 90), coffee)
	addPart(model, C, Vector3.new(0.3, 1.9, 1.9) * s, cf(0, 2.1 * s, 0, 0, 0, 90), cup, nil, 0.3) -- lid
	addPart(model, C, Vector3.new(0.9, 0.5, 0.5) * s, cf(1.0 * s, 1.0 * s, 0, 0, 0, 90), cup) -- handle stub
	-- latte art heart
	addPart(model, Enum.PartType.Ball, Vector3.new(0.5, 0.1, 0.5) * s, cf(0, 2.06 * s, 0), cup)
	return 2.3 * s
end

Builders.Cone = function(model, v, s)
	local orange = rgb(v.Primary, { 255, 120, 20 })
	local white = rgb(v.Secondary, { 240, 240, 240 })
	addPart(model, Enum.PartType.Block, Vector3.new(2.0, 0.2, 2.0) * s, cf(0, 0.1 * s, 0), Color3.fromRGB(40, 40, 40))
	local levels = { 1.3, 1.05, 0.8, 0.55, 0.3 }
	for i, w in levels do
		local col = (i == 2 or i == 4) and white or orange
		addPart(model, Enum.PartType.Cylinder, Vector3.new(0.55, w, w) * s, cf(0, (0.2 + (i - 0.5) * 0.55) * s, 0, 0, 0, 90), col)
	end
	return 3.0 * s
end

Builders.Crate = function(model, v, s)
	local main = rgb(v.Primary, { 60, 120, 60 })
	local dark = rgb(v.Secondary, { 30, 30, 30 })
	local B = Enum.PartType.Block
	addPart(model, B, Vector3.new(2.0, 2.6, 1.8) * s, cf(0, 1.5 * s, 0), main)
	addPart(model, B, Vector3.new(2.2, 0.3, 2.0) * s, cf(0, 2.9 * s, -0.1 * s), dark) -- lid
	addPart(model, Enum.PartType.Cylinder, Vector3.new(0.5, 0.8, 0.8) * s, cf(-0.8 * s, 0.4 * s, -1.0 * s), dark)
	addPart(model, Enum.PartType.Cylinder, Vector3.new(0.5, 0.8, 0.8) * s, cf(0.8 * s, 0.4 * s, -1.0 * s), dark)
	addPart(model, B, Vector3.new(2.0, 0.15, 0.15) * s, cf(0, 2.4 * s, -1.0 * s), dark) -- handle
	return 3.1 * s
end

Builders.Blob = function(model, v, s)
	local main = rgb(v.Primary, { 150, 150, 150 })
	local sec = rgb(v.Secondary, v.Primary)
	addPart(model, Enum.PartType.Ball, Vector3.new(2.2, 1.6, 2.6) * s, cf(0, 0.8 * s, 0), main)
	addPart(model, Enum.PartType.Ball, Vector3.new(1.4, 1.0, 1.6) * s, cf(0.3 * s, 1.3 * s, -0.2 * s), sec)
	return 1.9 * s
end

Builders.Sign = function(model, v, s)
	local plate = rgb(v.Primary, { 200, 30, 30 })
	local face = rgb(v.Secondary, { 240, 240, 240 })
	local pole = rgb(v.Accent, { 40, 40, 40 })
	local B = Enum.PartType.Block
	addPart(model, Enum.PartType.Cylinder, Vector3.new(3.0, 0.25, 0.25) * s, cf(0, 1.5 * s, 0, 0, 0, 90), pole)
	addPart(model, B, Vector3.new(2.2, 1.3, 0.2) * s, cf(0, 3.2 * s, 0), plate)
	addPart(model, B, Vector3.new(1.9, 0.6, 0.1) * s, cf(0, 3.2 * s, 0.1 * s), face)
	addPart(model, Enum.PartType.Cylinder, Vector3.new(0.2, 1.2, 1.2) * s, cf(0, 1.0 * s, 0, 0, 0, 90), pole)
	return 3.9 * s
end

Builders.Statue = function(model, v, s)
	local stone = rgb(v.Primary, { 210, 210, 200 })
	local moss = rgb(v.Secondary, { 120, 140, 110 })
	local t = v.Transparency
	local B = Enum.PartType.Block
	local S = Enum.PartType.Ball
	local mat = t and Enum.Material.ForceField or Enum.Material.Slate
	addPart(model, B, Vector3.new(2.0, 0.5, 2.0) * s, cf(0, 0.25 * s, 0), moss, Enum.Material.Slate) -- plinth
	addPart(model, B, Vector3.new(1.0, 2.0, 0.7) * s, cf(0, 1.5 * s, 0), stone, mat, t) -- robe/body
	addPart(model, B, Vector3.new(1.3, 0.6, 0.8) * s, cf(0, 0.8 * s, 0), stone, mat, t) -- robe hem
	addPart(model, S, Vector3.new(0.7, 0.7, 0.7) * s, cf(0, 2.85 * s, 0), stone, mat, t) -- head
	addPart(model, B, Vector3.new(0.9, 0.5, 0.9) * s, cf(0, 3.1 * s, 0), stone, mat, t) -- halo / wimple
	-- wings (angel) or veil (nun)
	addPart(model, "Wedge", Vector3.new(0.2, 2.0, 1.2) * s, cf(-0.8 * s, 2.0 * s, -0.3 * s, 0, 90, 0), stone, mat, t)
	addPart(model, "Wedge", Vector3.new(0.2, 2.0, 1.2) * s, cf(0.8 * s, 2.0 * s, -0.3 * s, 0, -90, 0), stone, mat, t)
	-- hands together
	addPart(model, S, Vector3.new(0.5, 0.5, 0.5) * s, cf(0, 1.8 * s, 0.45 * s), stone, mat, t)
	return 3.4 * s
end

Builders.Vehicle = function(model, v, s)
	local body = rgb(v.Primary, { 200, 30, 30 })
	local trim = rgb(v.Secondary, { 240, 240, 240 })
	local dark = rgb(v.Accent, { 30, 30, 30 })
	local B = Enum.PartType.Block
	local C = Enum.PartType.Cylinder
	local tall = s >= 1.6 -- buses / trains get a second deck
	local h = tall and 3.4 or 2.0
	addPart(model, B, Vector3.new(2.2, h, 4.6) * s, cf(0, (0.6 + h / 2) * s, 0), body)
	addPart(model, B, Vector3.new(2.3, 0.6, 4.0) * s, cf(0, (0.6 + h - 0.9) * s, 0), trim, Enum.Material.Glass, 0.2) -- windows
	if tall then
		addPart(model, B, Vector3.new(2.3, 0.6, 4.0) * s, cf(0, 1.8 * s, 0), trim, Enum.Material.Glass, 0.2)
	end
	addPart(model, B, Vector3.new(2.3, 0.2, 4.7) * s, cf(0, (0.6 + h + 0.1) * s, 0), trim) -- roof
	for _, x in { -1.0, 1.0 } do
		for _, z in { -1.5, 1.5 } do
			addPart(model, C, Vector3.new(0.5, 1.1, 1.1) * s, cf(x * s, 0.55 * s, z * s, 0, 0, 90), dark)
		end
	end
	addPart(model, B, Vector3.new(1.6, 0.3, 0.15) * s, cf(0, (0.6 + h - 0.5) * s, 2.35 * s), Color3.fromRGB(255, 240, 150), Enum.Material.Neon) -- destination blind / headlight
	return (0.8 + h) * s
end

Builders.Building = function(model, v, s)
	local wall = rgb(v.Primary, { 150, 145, 135 })
	local roof = rgb(v.Secondary, { 90, 90, 90 })
	local accent = rgb(v.Accent, { 40, 40, 40 })
	local B = Enum.PartType.Block
	addPart(model, B, Vector3.new(3.0, 3.0, 2.6) * s, cf(0, 1.5 * s, 0), wall, Enum.Material.Brick)
	addPart(model, "Wedge", Vector3.new(3.2, 1.2, 1.4) * s, cf(0, 3.6 * s, 0.7 * s, 0, 180, 0), roof, Enum.Material.Slate)
	addPart(model, "Wedge", Vector3.new(3.2, 1.2, 1.4) * s, cf(0, 3.6 * s, -0.7 * s), roof, Enum.Material.Slate)
	addPart(model, B, Vector3.new(0.9, 1.6, 0.1) * s, cf(0, 0.8 * s, 1.33 * s), accent) -- door
	for _, x in { -1.0, 1.0 } do
		addPart(model, B, Vector3.new(0.7, 0.8, 0.1) * s, cf(x * s, 1.9 * s, 1.33 * s), Color3.fromRGB(190, 220, 255), Enum.Material.Glass, 0.2)
	end
	addPart(model, B, Vector3.new(2.6, 0.5, 0.15) * s, cf(0, 2.75 * s, 1.36 * s), accent) -- fascia
	return 4.2 * s
end

Builders.Umbrella = function(model, v, s)
	local canopy = rgb(v.Primary, { 40, 40, 120 })
	local pole = rgb(v.Secondary, { 120, 120, 120 })
	addPart(model, Enum.PartType.Cylinder, Vector3.new(2.6, 0.12, 0.12) * s, cf(0, 1.3 * s, 0, 0, 0, 90), pole)
	-- inverted canopy: a bowl made from a flattened ball
	addPart(model, Enum.PartType.Ball, Vector3.new(2.8, 0.9, 2.8) * s, cf(0, 2.5 * s, 0), canopy)
	addPart(model, Enum.PartType.Ball, Vector3.new(2.3, 0.6, 2.3) * s, cf(0, 2.75 * s, 0), Palette.darken(v.Primary, 0.3))
	addPart(model, Enum.PartType.Cylinder, Vector3.new(0.6, 0.3, 0.3) * s, cf(0, 0.15 * s, 0.25 * s, 90, 0, 0), pole) -- handle
	return 3.0 * s
end

Builders.Bike = function(model, v, s)
	local frame = rgb(v.Primary, { 30, 180, 190 })
	local tyre = rgb(v.Secondary, { 30, 30, 30 })
	local C = Enum.PartType.Cylinder
	local B = Enum.PartType.Block
	addPart(model, C, Vector3.new(0.2, 1.6, 1.6) * s, cf(0, 0.8 * s, 1.3 * s, 0, 90, 0), tyre)
	addPart(model, C, Vector3.new(0.2, 1.6, 1.6) * s, cf(0, 0.8 * s, -1.3 * s, 0, 90, 0), tyre)
	addPart(model, B, Vector3.new(0.15, 0.15, 2.6) * s, cf(0, 1.5 * s, 0), frame)
	addPart(model, B, Vector3.new(0.15, 1.3, 0.15) * s, cf(0, 1.4 * s, -0.9 * s, 15, 0, 0), frame)
	addPart(model, B, Vector3.new(0.15, 1.3, 0.15) * s, cf(0, 1.4 * s, 1.0 * s, -15, 0, 0), frame)
	addPart(model, B, Vector3.new(1.2, 0.1, 0.1) * s, cf(0, 2.1 * s, 1.2 * s), tyre) -- bars
	addPart(model, B, Vector3.new(0.5, 0.15, 0.8) * s, cf(0, 2.1 * s, -0.7 * s), tyre) -- saddle
	return 2.3 * s
end

Builders.Piano = function(model, v, s)
	local body = rgb(v.Primary, { 30, 30, 30 })
	local keys = rgb(v.Secondary, { 240, 240, 240 })
	local B = Enum.PartType.Block
	addPart(model, B, Vector3.new(3.2, 2.6, 1.4) * s, cf(0, 1.3 * s, -0.3 * s), body, Enum.Material.Wood)
	addPart(model, B, Vector3.new(3.0, 0.2, 0.9) * s, cf(0, 1.9 * s, 0.75 * s), keys)
	for i = -6, 6 do
		if i % 2 ~= 0 then
			addPart(model, B, Vector3.new(0.12, 0.12, 0.5) * s, cf(i * 0.22 * s, 2.0 * s, 0.6 * s), body)
		end
	end
	addPart(model, B, Vector3.new(3.4, 0.15, 0.6) * s, cf(0, 2.65 * s, 0.4 * s), body, Enum.Material.Wood)
	return 2.8 * s
end

Builders.Gate = function(model, v, s)
	local iron = rgb(v.Primary, { 40, 40, 45 })
	local stone = rgb(v.Secondary, { 150, 145, 135 })
	local gold = rgb(v.Accent, { 255, 200, 40 })
	local B = Enum.PartType.Block
	for _, x in { -1.6, 1.6 } do
		addPart(model, B, Vector3.new(0.8, 3.6, 0.8) * s, cf(x * s, 1.8 * s, 0), stone, Enum.Material.Slate)
		addPart(model, Enum.PartType.Ball, Vector3.new(0.9, 0.9, 0.9) * s, cf(x * s, 3.9 * s, 0), stone, Enum.Material.Slate)
	end
	for i = -4, 4 do
		addPart(model, B, Vector3.new(0.1, 3.0, 0.1) * s, cf(i * 0.3 * s, 1.5 * s, 0), iron, Enum.Material.Metal)
	end
	addPart(model, B, Vector3.new(2.6, 0.12, 0.12) * s, cf(0, 2.6 * s, 0), iron, Enum.Material.Metal)
	addPart(model, B, Vector3.new(2.6, 0.12, 0.12) * s, cf(0, 0.6 * s, 0), iron, Enum.Material.Metal)
	addPart(model, B, Vector3.new(2.4, 0.5, 0.15) * s, cf(0, 3.3 * s, 0), iron, Enum.Material.Metal) -- arch sign
	addPart(model, B, Vector3.new(2.0, 0.25, 0.05) * s, cf(0, 3.3 * s, 0.1 * s), gold, Enum.Material.Neon)
	return 4.3 * s
end

Builders.Tower = function(model, v, s)
	local brick = rgb(v.Primary, { 150, 100, 70 })
	local face = rgb(v.Secondary, { 245, 236, 214 })
	local dark = rgb(v.Accent, { 40, 40, 40 })
	local B = Enum.PartType.Block
	addPart(model, B, Vector3.new(1.4, 4.0, 1.4) * s, cf(0, 2.0 * s, 0), brick, Enum.Material.Brick)
	addPart(model, B, Vector3.new(1.6, 0.3, 1.6) * s, cf(0, 4.15 * s, 0), dark)
	addPart(model, "Wedge", Vector3.new(1.6, 0.8, 0.8) * s, cf(0, 4.7 * s, 0.4 * s, 0, 180, 0), dark)
	addPart(model, "Wedge", Vector3.new(1.6, 0.8, 0.8) * s, cf(0, 4.7 * s, -0.4 * s), dark)
	addPart(model, Enum.PartType.Cylinder, Vector3.new(0.1, 1.1, 1.1) * s, cf(0, 3.3 * s, 0.72 * s, 0, 90, 0), face)
	addPart(model, B, Vector3.new(0.08, 0.45, 0.05) * s, cf(0, 3.5 * s, 0.78 * s), dark) -- hand
	addPart(model, B, Vector3.new(0.35, 0.08, 0.05) * s, cf(0.15 * s, 3.3 * s, 0.78 * s), dark) -- hand
	return 5.1 * s
end

Builders.Disk = function(model, v, s)
	local top = rgb(v.Primary, { 70, 150, 70 })
	local rim = rgb(v.Secondary, { 110, 70, 40 })
	local accent = rgb(v.Accent, v.Primary)
	addPart(model, Enum.PartType.Cylinder, Vector3.new(0.6, 3.2, 3.2) * s, cf(0, 0.3 * s, 0, 0, 0, 90), rim)
	addPart(model, Enum.PartType.Cylinder, Vector3.new(0.2, 3.0, 3.0) * s, cf(0, 0.7 * s, 0, 0, 0, 90), top)
	addPart(model, Enum.PartType.Ball, Vector3.new(1.2, 1.2, 1.2) * s, cf(0, 1.4 * s, 0), accent, Enum.Material.Neon)
	return 2.0 * s
end

local function addCrown(model: Model, height: number, s: number)
	local gold = Color3.fromRGB(255, 200, 40)
	local y = height - 0.1 * s
	addPart(model, Enum.PartType.Cylinder, Vector3.new(0.35, 0.9, 0.9) * s, cf(0, y, 1.5 * s, 0, 0, 90), gold, Enum.Material.Metal)
	for i = 0, 3 do
		local a = i * math.pi / 2
		addPart(model, Enum.PartType.Block, Vector3.new(0.15, 0.35, 0.15) * s, cf(math.cos(a) * 0.4 * s, y + 0.3 * s, 1.5 * s + math.sin(a) * 0.4 * s), gold, Enum.Material.Metal)
	end
end

-- ───────────────────────── Public API ─────────────────────────

function CollectibleFactory.build(itemId: string): Model
	local item = Collectibles.get(itemId)
	assert(item, "Unknown collectible " .. tostring(itemId))

	local model = Instance.new("Model")
	model.Name = item.Id
	model:SetAttribute("ItemId", item.Id)
	model:SetAttribute("Rarity", item.Rarity)

	local root = Instance.new("Part")
	root.Name = "Root"
	root.Size = Vector3.new(0.5, 0.5, 0.5)
	root.Transparency = 1
	root.CanCollide = false
	root.CanQuery = true
	root.CanTouch = false
	root.Anchored = true
	root.Massless = true
	root.CFrame = CFrame.new(0, 0.25, 0)
	root.Parent = model
	model.PrimaryPart = root

	local s = (item.Visual.Scale or 1)
	local height: number

	local meshId = Assets.meshId(item.Id)
	local template = meshId and getMeshTemplate(meshId) or nil
	if template then
		-- Uploaded mesh: scale it uniformly so it is ~UNIT*s tall, standing on the root.
		local mesh = template:Clone()
		mesh.Name = "Mesh"
		local native = mesh.MeshSize
		local tallest = math.max(native.X, native.Y, native.Z, 0.01)
		local factor = (UNIT * s) / tallest
		mesh.Size = native * factor
		mesh.CFrame = CFrame.new(0, mesh.Size.Y / 2, 0)
		mesh.Anchored = false
		mesh.CanCollide = false
		mesh.CanQuery = false
		mesh.CanTouch = false
		mesh.Massless = true
		mesh.Parent = model
		height = mesh.Size.Y
	else
		local builder = Builders[item.Visual.Builder] or Builders.Blob
		height = builder(model, item.Visual, s)
		if item.Visual.Crown then
			addCrown(model, height, s)
		end
	end

	-- Weld everything to the root so the whole thing can be moved as one.
	for _, child in model:GetChildren() do
		if child:IsA("BasePart") and child ~= root then
			local weld = Instance.new("WeldConstraint")
			weld.Part0 = root
			weld.Part1 = child
			weld.Parent = child
		end
	end

	-- Rarity glow
	local rarityInfo = Rarity.get(item.Rarity)
	if rarityInfo.Glow then
		local light = Instance.new("PointLight")
		light.Color = Palette.rgb(rarityInfo.ColorRGB)
		light.Brightness = 1.2
		light.Range = 10 + 4 * s
		light.Parent = root
		local sparkles = Instance.new("Sparkles")
		sparkles.SparkleColor = Palette.rgb(rarityInfo.ColorRGB)
		sparkles.Parent = root
	end

	-- Floating label
	local gui = Instance.new("BillboardGui")
	gui.Name = "Label"
	gui.Size = UDim2.fromOffset(220, 70)
	gui.StudsOffsetWorldSpace = Vector3.new(0, height + 1.2, 0)
	gui.AlwaysOnTop = false
	gui.MaxDistance = 90
	gui.LightInfluence = 0
	gui.Parent = root

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Name = "Name"
	nameLabel.Size = UDim2.new(1, 0, 0.5, 0)
	nameLabel.BackgroundTransparency = 1
	nameLabel.Text = item.Name
	nameLabel.TextColor3 = Color3.new(1, 1, 1)
	nameLabel.TextStrokeTransparency = 0.2
	nameLabel.TextScaled = true
	nameLabel.Font = Enum.Font.FredokaOne
	nameLabel.Parent = gui

	local sub = Instance.new("TextLabel")
	sub.Name = "Sub"
	sub.Size = UDim2.new(1, 0, 0.5, 0)
	sub.Position = UDim2.new(0, 0, 0.5, 0)
	sub.BackgroundTransparency = 1
	sub.Text = rarityInfo.Label
	sub.TextColor3 = Palette.rgb(rarityInfo.ColorRGB)
	sub.TextStrokeTransparency = 0.2
	sub.TextScaled = true
	sub.Font = Enum.Font.FredokaOne
	sub.Parent = gui

	model:SetAttribute("Height", height)
	return model
end

-- Set the second line of the floating label (price on the belt, income on a pedestal...).
function CollectibleFactory.setSubtext(model: Model, text: string, color: Color3?)
	local root = model.PrimaryPart
	if not root then
		return
	end
	local gui = root:FindFirstChild("Label")
	local sub = gui and gui:FindFirstChild("Sub")
	if sub and sub:IsA("TextLabel") then
		sub.Text = text
		if color then
			sub.TextColor3 = color
		end
	end
end

function CollectibleFactory.setLabelVisible(model: Model, visible: boolean)
	local root = model.PrimaryPart
	local gui = root and root:FindFirstChild("Label")
	if gui and gui:IsA("BillboardGui") then
		gui.Enabled = visible
	end
end

-- Anchor / unanchor the whole model (root only needs it, welds carry the rest).
function CollectibleFactory.setAnchored(model: Model, anchored: boolean)
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") then
			p.Anchored = anchored
		end
	end
end

function CollectibleFactory.setCollidable(model: Model, canCollide: boolean)
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") and p.Name ~= "Root" then
			p.CanCollide = canCollide
		end
	end
end

return CollectibleFactory

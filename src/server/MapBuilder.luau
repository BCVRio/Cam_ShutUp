--!strict
-- Builds the stylised Nunhead map entirely from parts:
--   * ground + Evelina Road running east-west through the middle
--   * the conveyor belt along the north pavement
--   * Nunhead Green (west end): grass circle, trees, benches, spawn
--   * Nunhead Cemetery (east end): wall, gates, gravestones, chapel ruins
--   * Nunhead Station (north backdrop): platform, canopy, sign
--   * South London skyline silhouette (south backdrop)
-- Plots themselves are built by PlotService; this module returns the plot origins.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)

local MapBuilder = {}

local M = Config.Map

local COL = {
	Grass = Color3.fromRGB(96, 150, 72),
	GrassDark = Color3.fromRGB(78, 128, 60),
	Tarmac = Color3.fromRGB(70, 70, 74),
	Pavement = Color3.fromRGB(175, 170, 160),
	Kerb = Color3.fromRGB(200, 196, 188),
	Brick = Color3.fromRGB(150, 95, 70),
	Stone = Color3.fromRGB(150, 145, 135),
	StoneDark = Color3.fromRGB(110, 108, 100),
	Iron = Color3.fromRGB(40, 40, 45),
	Trunk = Color3.fromRGB(100, 70, 45),
	Leaf = Color3.fromRGB(60, 130, 60),
	LeafAutumn = Color3.fromRGB(200, 120, 50),
	Belt = Color3.fromRGB(55, 55, 60),
	BeltEdge = Color3.fromRGB(255, 196, 40),
	Sky = Color3.fromRGB(60, 50, 80),
	Cream = Color3.fromRGB(245, 236, 214),
	Green = Color3.fromRGB(40, 100, 70),
}

local mapFolder: Folder

local function part(name: string, size: Vector3, cframe: CFrame, color: Color3, material: Enum.Material?, parent: Instance?): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.CFrame = cframe
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent or mapFolder
	return p
end

local function wedge(name: string, size: Vector3, cframe: CFrame, color: Color3, material: Enum.Material?, parent: Instance?): WedgePart
	local p = Instance.new("WedgePart")
	p.Name = name
	p.Size = size
	p.CFrame = cframe
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.Anchored = true
	p.Parent = parent or mapFolder
	return p
end

local function textSign(parent: BasePart, face: Enum.NormalId, text: string, color: Color3, bg: Color3?)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.Parent = parent
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = bg and 0 or 1
	label.BackgroundColor3 = bg or Color3.new()
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = true
	label.Font = Enum.Font.FredokaOne
	label.Parent = gui
end

local function tree(pos: Vector3, scale: number, autumn: boolean?)
	local folder = Instance.new("Model")
	folder.Name = "Tree"
	folder.Parent = mapFolder
	part("Trunk", Vector3.new(1.6, 7, 1.6) * scale, CFrame.new(pos + Vector3.new(0, 3.5 * scale, 0)), COL.Trunk, Enum.Material.Wood, folder)
	local leaf = autumn and COL.LeafAutumn or COL.Leaf
	local canopy = part("Canopy", Vector3.new(8, 7, 8) * scale, CFrame.new(pos + Vector3.new(0, 9 * scale, 0)), leaf, Enum.Material.Grass, folder)
	canopy.Shape = Enum.PartType.Ball
	local c2 = part("Canopy2", Vector3.new(5.5, 5, 5.5) * scale, CFrame.new(pos + Vector3.new(2 * scale, 11 * scale, 1 * scale)), leaf, Enum.Material.Grass, folder)
	c2.Shape = Enum.PartType.Ball
end

local function bench(cframe: CFrame)
	part("BenchSeat", Vector3.new(5, 0.3, 1.4), cframe * CFrame.new(0, 1.5, 0), COL.Trunk, Enum.Material.Wood)
	part("BenchBack", Vector3.new(5, 1.4, 0.25), cframe * CFrame.new(0, 2.3, -0.6), COL.Trunk, Enum.Material.Wood)
	for _, x in { -2.1, 2.1 } do
		part("BenchLeg", Vector3.new(0.3, 1.5, 1.4), cframe * CFrame.new(x, 0.75, 0), COL.Iron, Enum.Material.Metal)
	end
end

local function lamp(pos: Vector3)
	part("LampPost", Vector3.new(0.5, 12, 0.5), CFrame.new(pos + Vector3.new(0, 6, 0)), COL.Iron, Enum.Material.Metal)
	local head = part("LampHead", Vector3.new(1.4, 0.8, 1.4), CFrame.new(pos + Vector3.new(0, 12.2, 0)), Color3.fromRGB(255, 225, 160), Enum.Material.Neon)
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 220, 150)
	light.Range = 26
	light.Brightness = 1.5
	light.Parent = head
end

local function gravestone(cframe: CFrame, variant: number)
	local col = variant % 2 == 0 and COL.Stone or COL.StoneDark
	if variant % 3 == 0 then
		-- cross
		part("Grave", Vector3.new(0.5, 3.2, 0.5), cframe * CFrame.new(0, 1.6, 0), col, Enum.Material.Slate)
		part("Grave", Vector3.new(1.8, 0.5, 0.5), cframe * CFrame.new(0, 2.4, 0), col, Enum.Material.Slate)
	else
		part("Grave", Vector3.new(2, 2.6, 0.5), cframe * CFrame.new(0, 1.3, 0), col, Enum.Material.Slate)
		local top = part("GraveTop", Vector3.new(0.5, 2, 2), cframe * CFrame.new(0, 2.6, 0) * CFrame.Angles(0, 0, math.rad(90)), col, Enum.Material.Slate)
		top.Shape = Enum.PartType.Cylinder
	end
	part("GraveBase", Vector3.new(2.6, 0.4, 1.2), cframe * CFrame.new(0, 0.2, 0), COL.StoneDark, Enum.Material.Slate)
end

local function gothicArch(cframe: CFrame, width: number, height: number, depth: number, broken: boolean)
	local pillarW = 2
	part("Pillar", Vector3.new(pillarW, height, depth), cframe * CFrame.new(-width / 2, height / 2, 0), COL.Stone, Enum.Material.Slate)
	part("Pillar", Vector3.new(pillarW, height * (broken and 0.65 or 1), depth), cframe * CFrame.new(width / 2, height * (broken and 0.325 or 0.5), 0), COL.Stone, Enum.Material.Slate)
	if not broken then
		wedge("ArchL", Vector3.new(depth, height * 0.35, width / 2), cframe * CFrame.new(-width / 4, height + height * 0.175, 0) * CFrame.Angles(0, math.rad(-90), 0), COL.Stone, Enum.Material.Slate)
		wedge("ArchR", Vector3.new(depth, height * 0.35, width / 2), cframe * CFrame.new(width / 4, height + height * 0.175, 0) * CFrame.Angles(0, math.rad(90), 0), COL.Stone, Enum.Material.Slate)
	end
end

-- ─────────────────────────────────────────────────────────────────────────────

function MapBuilder.build(): { Vector3 }
	mapFolder = Instance.new("Folder")
	mapFolder.Name = "Map"
	mapFolder.Parent = Workspace

	local G = M.GroundSize

	-- Ground
	local ground = part("Ground", Vector3.new(G, 4, G), CFrame.new(0, -2, 0), COL.Grass, Enum.Material.Grass)
	ground.Name = "Ground"

	-- Evelina Road (east-west) with kerbs and pavements
	local roadLen = G
	part("Road", Vector3.new(roadLen, 0.4, M.RoadWidth), CFrame.new(0, 0.1, 0), COL.Tarmac, Enum.Material.Asphalt)
	for i = -10, 10 do
		part("RoadLine", Vector3.new(8, 0.42, 0.5), CFrame.new(i * 24, 0.12, 0), Color3.new(1, 1, 1), Enum.Material.SmoothPlastic)
	end
	for _, side in { -1, 1 } do
		part("Pavement", Vector3.new(roadLen, 0.6, 10), CFrame.new(0, 0.2, side * (M.RoadWidth / 2 + 5)), COL.Pavement, Enum.Material.Concrete)
		part("Kerb", Vector3.new(roadLen, 0.7, 0.6), CFrame.new(0, 0.25, side * (M.RoadWidth / 2 + 0.3)), COL.Kerb, Enum.Material.Concrete)
	end
	for i = -5, 5 do
		lamp(Vector3.new(i * 45 + 10, 0.5, M.RoadWidth / 2 + 9))
		lamp(Vector3.new(i * 45 - 10, 0.5, -(M.RoadWidth / 2 + 9)))
	end

	-- Conveyor belt along the north pavement edge
	local beltY = 1.6
	local beltZ = M.RoadWidth / 2 + 5
	local belt = part("ConveyorBelt", Vector3.new(Config.Conveyor.Length, 0.6, 6), CFrame.new(0, beltY, beltZ), COL.Belt, Enum.Material.DiamondPlate)
	belt.Name = "ConveyorBelt"
	part("BeltEdge", Vector3.new(Config.Conveyor.Length, 0.9, 0.6), CFrame.new(0, beltY, beltZ + 3.3), COL.BeltEdge, Enum.Material.SmoothPlastic)
	part("BeltEdge", Vector3.new(Config.Conveyor.Length, 0.9, 0.6), CFrame.new(0, beltY, beltZ - 3.3), COL.BeltEdge, Enum.Material.SmoothPlastic)
	for i = 0, 6 do
		local x = -Config.Conveyor.Length / 2 + i * (Config.Conveyor.Length / 6)
		part("BeltLeg", Vector3.new(1, beltY, 5), CFrame.new(x, beltY / 2, beltZ), COL.Iron, Enum.Material.Metal)
	end
	-- Entry tunnel / exit tunnel
	local tunnelIn = part("BeltTunnelIn", Vector3.new(6, 8, 8), CFrame.new(-Config.Conveyor.Length / 2 - 2, 4, beltZ), COL.Brick, Enum.Material.Brick)
	textSign(tunnelIn, Enum.NormalId.Front, "DELIVERIES", COL.Cream, COL.Green)
	local tunnelOut = part("BeltTunnelOut", Vector3.new(6, 8, 8), CFrame.new(Config.Conveyor.Length / 2 + 2, 4, beltZ), COL.Brick, Enum.Material.Brick)
	textSign(tunnelOut, Enum.NormalId.Front, "GONE", COL.Cream, Color3.fromRGB(160, 40, 40))
	local banner = part("BeltBanner", Vector3.new(60, 6, 1), CFrame.new(0, 14, beltZ + 4), COL.Green, Enum.Material.SmoothPlastic)
	textSign(banner, Enum.NormalId.Front, "EVELINA ROAD  •  STEAL A NUNHEAD", COL.Cream)
	textSign(banner, Enum.NormalId.Back, "EVELINA ROAD  •  STEAL A NUNHEAD", COL.Cream)
	for _, x in { -29, 29 } do
		part("BannerPost", Vector3.new(1, 17, 1), CFrame.new(x, 8.5, beltZ + 4), COL.Iron, Enum.Material.Metal)
	end

	-- ── Nunhead Green (west end) ──
	local greenCentre = Vector3.new(-G / 2 + M.GreenRadius + 12, 0, -M.RoadWidth / 2 - 10 - M.GreenRadius)
	local green = part("NunheadGreen", Vector3.new(M.GreenRadius * 2, 0.5, M.GreenRadius * 2), CFrame.new(greenCentre + Vector3.new(0, 0.25, 0)), COL.GrassDark, Enum.Material.Grass)
	green.Shape = Enum.PartType.Cylinder
	green.CFrame = green.CFrame * CFrame.Angles(0, 0, math.rad(90))
	green.Size = Vector3.new(0.5, M.GreenRadius * 2, M.GreenRadius * 2)
	for i = 0, 7 do
		local a = i / 8 * math.pi * 2
		local r = M.GreenRadius * 0.75
		tree(greenCentre + Vector3.new(math.cos(a) * r, 0, math.sin(a) * r), 1 + (i % 3) * 0.2, i % 2 == 0)
	end
	for i = 0, 3 do
		local a = i / 4 * math.pi * 2 + math.pi / 4
		local r = M.GreenRadius * 0.4
		bench(CFrame.new(greenCentre + Vector3.new(math.cos(a) * r, 0.5, math.sin(a) * r)) * CFrame.Angles(0, -a + math.pi / 2, 0))
	end
	-- Little fountain in the middle
	local fountainBase = part("Fountain", Vector3.new(1, 10, 10), CFrame.new(greenCentre + Vector3.new(0, 1, 0)) * CFrame.Angles(0, 0, math.rad(90)), COL.Stone, Enum.Material.Slate)
	fountainBase.Shape = Enum.PartType.Cylinder
	local water = part("FountainWater", Vector3.new(0.4, 8.5, 8.5), CFrame.new(greenCentre + Vector3.new(0, 1.4, 0)) * CFrame.Angles(0, 0, math.rad(90)), Color3.fromRGB(80, 160, 220), Enum.Material.Glass)
	water.Shape = Enum.PartType.Cylinder
	water.Transparency = 0.3
	part("FountainSpout", Vector3.new(1.2, 4, 1.2), CFrame.new(greenCentre + Vector3.new(0, 3, 0)), COL.Stone, Enum.Material.Slate)
	-- Welcome sign + spawn
	local welcome = part("WelcomeSign", Vector3.new(14, 4, 0.6), CFrame.new(greenCentre + Vector3.new(0, 7, M.GreenRadius - 6)), COL.Green, Enum.Material.SmoothPlastic)
	textSign(welcome, Enum.NormalId.Front, "WELCOME TO NUNHEAD", COL.Cream)
	textSign(welcome, Enum.NormalId.Back, "SE15 • mind the foxes", COL.Cream)
	for _, x in { -6, 6 } do
		part("WelcomePost", Vector3.new(0.8, 9, 0.8), CFrame.new(greenCentre + Vector3.new(x, 4.5, M.GreenRadius - 6)), COL.Iron, Enum.Material.Metal)
	end
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "Spawn"
	spawn.Size = Vector3.new(12, 1, 12)
	spawn.CFrame = CFrame.new(greenCentre + Vector3.new(0, 0.6, M.GreenRadius * 0.55))
	spawn.Color = COL.GrassDark
	spawn.Material = Enum.Material.Grass
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Parent = mapFolder

	-- ── Nunhead Cemetery (east end) ──
	local cemX = G / 2 - 70
	local cemZ = -M.RoadWidth / 2 - 10
	local cemW = 130
	local cemD = 110
	local cemCentre = Vector3.new(cemX, 0, cemZ - cemD / 2)
	-- wall
	for _, side in { -1, 1 } do
		part("CemWall", Vector3.new(2, 6, cemD), CFrame.new(cemX + side * cemW / 2, 3, cemCentre.Z), COL.Brick, Enum.Material.Brick)
	end
	part("CemWall", Vector3.new(cemW, 6, 2), CFrame.new(cemX, 3, cemZ - cemD), COL.Brick, Enum.Material.Brick)
	-- front wall with a gap for the gates
	part("CemWall", Vector3.new(cemW / 2 - 8, 6, 2), CFrame.new(cemX - cemW / 4 - 4, 3, cemZ), COL.Brick, Enum.Material.Brick)
	part("CemWall", Vector3.new(cemW / 2 - 8, 6, 2), CFrame.new(cemX + cemW / 4 + 4, 3, cemZ), COL.Brick, Enum.Material.Brick)
	-- gate piers + ironwork
	for _, x in { -8, 8 } do
		part("GatePier", Vector3.new(3, 9, 3), CFrame.new(cemX + x, 4.5, cemZ), COL.Stone, Enum.Material.Slate)
		local ball = part("GatePierBall", Vector3.new(3, 3, 3), CFrame.new(cemX + x, 10.5, cemZ), COL.Stone, Enum.Material.Slate)
		ball.Shape = Enum.PartType.Ball
	end
	local gateSign = part("GateSign", Vector3.new(19, 2.5, 0.8), CFrame.new(cemX, 11, cemZ), COL.Iron, Enum.Material.Metal)
	textSign(gateSign, Enum.NormalId.Front, "NUNHEAD CEMETERY", Color3.fromRGB(255, 200, 40))
	textSign(gateSign, Enum.NormalId.Back, "NUNHEAD CEMETERY", Color3.fromRGB(255, 200, 40))
	for i = -6, 6 do
		if i ~= 0 then
			part("GateBar", Vector3.new(0.3, 7, 0.3), CFrame.new(cemX + i * 1.1, 3.5, cemZ), COL.Iron, Enum.Material.Metal)
		end
	end
	-- gravestones
	local rng = Random.new(1899)
	for i = 1, 60 do
		local gx = cemX + rng:NextNumber(-cemW / 2 + 6, cemW / 2 - 6)
		local gz = cemZ - rng:NextNumber(10, cemD - 8)
		gravestone(CFrame.new(gx, 0, gz) * CFrame.Angles(0, math.rad(rng:NextNumber(-20, 20)), 0), i)
	end
	for i = 1, 10 do
		local tx = cemX + rng:NextNumber(-cemW / 2 + 8, cemW / 2 - 8)
		local tz = cemZ - rng:NextNumber(14, cemD - 10)
		tree(Vector3.new(tx, 0, tz), rng:NextNumber(1.2, 1.9), i % 3 == 0)
	end
	-- chapel ruins
	local chapel = CFrame.new(cemX, 0, cemZ - cemD * 0.7)
	gothicArch(chapel * CFrame.new(0, 0, 10), 14, 18, 3, false)
	gothicArch(chapel * CFrame.new(-12, 0, 0) * CFrame.Angles(0, math.rad(90), 0), 10, 14, 3, true)
	gothicArch(chapel * CFrame.new(12, 0, 0) * CFrame.Angles(0, math.rad(90), 0), 10, 14, 3, false)
	gothicArch(chapel * CFrame.new(0, 0, -10), 14, 20, 3, true)
	part("ChapelFloor", Vector3.new(28, 0.6, 24), chapel * CFrame.new(0, 0.3, 0), COL.StoneDark, Enum.Material.Cobblestone)
	part("ChapelSpireBase", Vector3.new(6, 26, 6), chapel * CFrame.new(0, 13, -12), COL.Stone, Enum.Material.Slate)
	wedge("ChapelSpire", Vector3.new(6, 8, 6), chapel * CFrame.new(0, 30, -12), COL.StoneDark, Enum.Material.Slate)

	-- ── Nunhead Station (north backdrop) ──
	local stZ = M.PlotRowOffset + M.PlotDepth / 2 + 24
	part("Platform", Vector3.new(190, 1.6, 10), CFrame.new(0, 0.8, stZ), COL.Pavement, Enum.Material.Concrete)
	part("PlatformEdge", Vector3.new(190, 1.7, 1), CFrame.new(0, 0.85, stZ - 4.5), Color3.fromRGB(255, 240, 120), Enum.Material.SmoothPlastic)
	for i = -4, 4 do
		part("CanopyPost", Vector3.new(0.8, 10, 0.8), CFrame.new(i * 22, 6.6, stZ + 2), COL.Green, Enum.Material.Metal)
	end
	part("Canopy", Vector3.new(190, 0.6, 12), CFrame.new(0, 11.8, stZ + 1), COL.Green, Enum.Material.Metal)
	part("CanopyTrim", Vector3.new(190, 1.4, 0.4), CFrame.new(0, 11.2, stZ - 5), COL.Cream, Enum.Material.SmoothPlastic)
	part("Rails", Vector3.new(220, 0.5, 8), CFrame.new(0, 0.25, stZ + 12), COL.StoneDark, Enum.Material.Pebble)
	for _, z in { stZ + 9.5, stZ + 14.5 } do
		part("Rail", Vector3.new(220, 0.6, 0.5), CFrame.new(0, 0.8, z), COL.Iron, Enum.Material.Metal)
	end
	for i = -25, 25 do
		part("Sleeper", Vector3.new(1, 0.4, 7), CFrame.new(i * 4.2, 0.55, stZ + 12), COL.Trunk, Enum.Material.Wood)
	end
	local stationSign = part("StationSign", Vector3.new(26, 4, 0.6), CFrame.new(0, 8, stZ - 4.6), Color3.new(1, 1, 1), Enum.Material.SmoothPlastic)
	textSign(stationSign, Enum.NormalId.Front, "NUNHEAD", Color3.fromRGB(20, 40, 120))
	textSign(stationSign, Enum.NormalId.Back, "NUNHEAD", Color3.fromRGB(20, 40, 120))
	local stationStripe = part("StationStripe", Vector3.new(26, 0.6, 0.65), CFrame.new(0, 10.2, stZ - 4.6), Color3.fromRGB(200, 30, 30), Enum.Material.SmoothPlastic)
	stationStripe.Name = "StationStripe"
	-- station building behind
	part("StationBuilding", Vector3.new(60, 18, 14), CFrame.new(0, 9, stZ + 26), COL.Brick, Enum.Material.Brick)
	wedge("StationRoof", Vector3.new(60, 6, 7), CFrame.new(0, 21, stZ + 29.5), COL.StoneDark, Enum.Material.Slate)
	wedge("StationRoof", Vector3.new(60, 6, 7), CFrame.new(0, 21, stZ + 22.5) * CFrame.Angles(0, math.rad(180), 0), COL.StoneDark, Enum.Material.Slate)
	part("ClockTower", Vector3.new(8, 32, 8), CFrame.new(-36, 16, stZ + 26), COL.Brick, Enum.Material.Brick)
	local clock = part("ClockFace", Vector3.new(0.4, 6, 6), CFrame.new(-36, 28, stZ + 21.8) * CFrame.Angles(0, math.rad(90), 0), COL.Cream, Enum.Material.SmoothPlastic)
	clock.Shape = Enum.PartType.Cylinder
	textSign(clock, Enum.NormalId.Right, "8:14", COL.Iron)
	for i = -2, 2 do
		part("StationWindow", Vector3.new(4, 7, 0.4), CFrame.new(i * 11, 10, stZ + 18.9), Color3.fromRGB(255, 230, 170), Enum.Material.Neon)
	end

	-- ── South London skyline silhouette (south backdrop) ──
	local skyZ = -(M.PlotRowOffset + M.PlotDepth / 2 + 40)
	local skyRng = Random.new(2026)
	for i = -14, 14 do
		local h = skyRng:NextNumber(14, 40)
		local w = skyRng:NextNumber(10, 18)
		local b = part("Skyline", Vector3.new(w, h, 10), CFrame.new(i * 17, h / 2, skyZ - skyRng:NextNumber(0, 20)), COL.Sky, Enum.Material.SmoothPlastic)
		for _ = 1, 3 do
			local win = part("Window", Vector3.new(1.4, 1.4, 0.2), b.CFrame * CFrame.new(skyRng:NextNumber(-w / 2 + 1, w / 2 - 1), skyRng:NextNumber(-h / 2 + 2, h / 2 - 2), 5.1), Color3.fromRGB(255, 220, 150), Enum.Material.Neon)
			win.Name = "SkyWindow"
		end
	end
	-- a nod to the Shard
	wedge("Shard", Vector3.new(12, 70, 12), CFrame.new(60, 35, skyZ - 40), Color3.fromRGB(150, 170, 200), Enum.Material.Glass)
	wedge("Shard", Vector3.new(12, 70, 12), CFrame.new(60, 35, skyZ - 40) * CFrame.Angles(0, math.rad(180), 0), Color3.fromRGB(150, 170, 200), Enum.Material.Glass)

	-- ── Plot origins (two rows of 4, either side of the road) ──
	local origins: { Vector3 } = {}
	local perRow = Config.PlotCount // 2
	local rowWidth = perRow * M.PlotSize + (perRow - 1) * M.PlotGap
	for row = 1, 2 do
		local z = (row == 1) and M.PlotRowOffset or -M.PlotRowOffset
		for i = 1, perRow do
			local x = -rowWidth / 2 + M.PlotSize / 2 + (i - 1) * (M.PlotSize + M.PlotGap)
			table.insert(origins, Vector3.new(x, 0, z))
		end
	end
	-- Paths from the pavement up to each plot
	for _, o in origins do
		local dir = o.Z > 0 and 1 or -1
		local startZ = dir * (M.RoadWidth / 2 + 10)
		local endZ = o.Z - dir * M.PlotDepth / 2
		local len = math.abs(endZ - startZ)
		part("Path", Vector3.new(8, 0.5, len), CFrame.new(o.X, 0.2, (startZ + endZ) / 2), COL.Pavement, Enum.Material.Cobblestone)
	end

	return origins
end

function MapBuilder.getConveyorBelt(): BasePart
	return mapFolder:WaitForChild("ConveyorBelt") :: BasePart
end

return MapBuilder

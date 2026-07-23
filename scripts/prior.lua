-- ============================================================
--  EazyCheats loader  (per-game, remembers your key)
--  Configure the three CONFIG fields per game. Everything else
--  is shared. An active key is saved locally, so after the first
--  activation the script auto-loads on relaunch until the key
--  expires — no need to re-enter it every time.
-- ============================================================
local CONFIG = {
    TITLE   = "Prior Extinction",
    HUB_URL = "https://eazycheats.com/s/hub",     -- the hub this loader unlocks
    KEY_ID  = "prior",
}

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local UserInputService = game:GetService("UserInputService")
local LocalPlayer = Players.LocalPlayer

local DISCORD_INVITE = "https://discord.gg/uVXQTGefvq"
local KEY_FILE = "eazycheats_" .. CONFIG.KEY_ID .. ".key"

local function copyToClipboard(text)
    local clip = setclipboard or (syn and syn.write_clipboard) or toclipboard or set_clipboard
    return clip ~= nil and pcall(clip, text)
end

-- ---------- remembered key (activate once, auto-load until expiry) ----------
local function saveKey(k)
    pcall(function() if writefile then writefile(KEY_FILE, tostring(k)) end end)
end
local function loadSavedKey()
    local k
    pcall(function()
        if isfile and readfile and isfile(KEY_FILE) then k = readfile(KEY_FILE) end
    end)
    if type(k) == "string" then k = k:gsub("^%s*(.-)%s*$", "%1") end
    if type(k) == "string" and #k > 0 then return k end
    return nil
end
local function clearSavedKey()
    pcall(function() if delfile and isfile and isfile(KEY_FILE) then delfile(KEY_FILE) end end)
end

local function getHWID()
    local h
    pcall(function() if gethwid then h = gethwid() end end)
    if h == nil or tostring(h) == "" then
        pcall(function() h = game:GetService("RbxAnalyticsService"):GetClientId() end)
    end
    return tostring(h or "unknown")
end
local HWID = getHWID()

local function tryKey(key)
    local url = CONFIG.HUB_URL .. "?key=" .. HttpService:UrlEncode(key) .. "&hwid=" .. HttpService:UrlEncode(HWID)
    local ok, resp = pcall(function() return game:HttpGet(url) end)
    if not ok or type(resp) ~= "string" or #resp == 0 then
        return false, "Could not reach the server."
    end
    if resp:sub(1, 8) == "--@DENY:" then
        return false, (resp:match("^%-%-@DENY:([^\r\n]*)") or "Access denied.")
    end
    return true, resp
end

local function runHub(src)
    local fn = loadstring(src)
    if fn then fn() end
end

-- 1) preset key via getgenv().Key
do
    local preset = (getgenv and getgenv().Key)
    if preset and tostring(preset) ~= "" then
        local ok, payload = tryKey(tostring(preset))
        if ok then saveKey(tostring(preset)); return runHub(payload) end
    end
end

-- 2) remembered key: if it's still active, load instantly with no popup
do
    local saved = loadSavedKey()
    if saved then
        local ok, payload = tryKey(saved)
        if ok then return runHub(payload) end
        clearSavedKey()  -- expired / disabled / wrong game → forget it and ask again
    end
end

-- 3) key popup
local result, done = nil, false

local gui = Instance.new("ScreenGui")
gui.Name = "EazyCheatsKey"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true; gui.DisplayOrder = 100000
local ok = false
if type(gethui) == "function" then pcall(function() gui.Parent = gethui(); ok = true end) end
if not ok then pcall(function() gui.Parent = game:GetService("CoreGui"); ok = true end) end
if not gui.Parent then gui.Parent = LocalPlayer:WaitForChild("PlayerGui") end

-- Modal button: while a Visible Modal button exists the engine frees the cursor and
-- IGNORES anything trying to lock it to screen-centre. Without this the game keeps
-- control of the mouse and you have to fight it to click the key box. Same trick the
-- hub menu uses. It must be ON-screen (not pushed off) for the engine to count it.
local modalBtn = Instance.new("TextButton")
modalBtn.Name = "EC_KeyModal"
modalBtn.Modal = true
modalBtn.Visible = true
modalBtn.Text = ""
modalBtn.AutoButtonColor = false
modalBtn.BackgroundTransparency = 1
modalBtn.Size = UDim2.new(0, 1, 0, 1)
modalBtn.Position = UDim2.new(0, 0, 0, 0)
modalBtn.ZIndex = 1
modalBtn.Parent = gui

-- keep the cursor visible while the popup is up
local UIS = game:GetService("UserInputService")
local prevMouseIcon = UIS.MouseIconEnabled
pcall(function() UIS.MouseIconEnabled = true end)

local function releaseMouse()
    pcall(function() if modalBtn then modalBtn.Visible = false end end)
    pcall(function() UIS.MouseIconEnabled = prevMouseIcon end)
end

local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 330, 0, 196); frame.Position = UDim2.new(0.5, -165, 0.5, -98)
frame.BackgroundColor3 = Color3.fromRGB(22, 22, 30); frame.BorderSizePixel = 0; frame.Active = true; frame.Parent = gui
Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 10)
local stroke = Instance.new("UIStroke", frame); stroke.Color = Color3.fromRGB(80, 120, 255); stroke.Thickness = 1.5

do
    local dragging, dragStart, startPos
    frame.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = true; dragStart = input.Position; startPos = frame.Position
        end
    end)
    frame.InputEnded:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = false
        end
    end)
    UserInputService.InputChanged:Connect(function(input)
        if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            local d = input.Position - dragStart
            frame.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + d.X, startPos.Y.Scale, startPos.Y.Offset + d.Y)
        end
    end)
end

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -50, 0, 30); title.Position = UDim2.new(0, 14, 0, 12); title.BackgroundTransparency = 1
title.Text = CONFIG.TITLE; title.TextColor3 = Color3.fromRGB(235, 235, 245); title.Font = Enum.Font.GothamBold
title.TextSize = 18; title.TextXAlignment = Enum.TextXAlignment.Left; title.Parent = frame

local box = Instance.new("TextBox")
box.Size = UDim2.new(1, -28, 0, 36); box.Position = UDim2.new(0, 14, 0, 50); box.BackgroundColor3 = Color3.fromRGB(38, 38, 52)
box.BorderSizePixel = 0; box.Text = ""; box.PlaceholderText = "Enter your key..."; box.PlaceholderColor3 = Color3.fromRGB(120, 120, 140)
box.TextColor3 = Color3.fromRGB(235, 235, 245); box.Font = Enum.Font.Gotham; box.TextSize = 14; box.ClearTextOnFocus = false; box.Parent = frame
Instance.new("UICorner", box).CornerRadius = UDim.new(0, 6)

local status = Instance.new("TextLabel")
status.Size = UDim2.new(1, -28, 0, 18); status.Position = UDim2.new(0, 14, 0, 92); status.BackgroundTransparency = 1
status.Text = ""; status.TextColor3 = Color3.fromRGB(255, 90, 90); status.Font = Enum.Font.Gotham; status.TextSize = 12
status.TextXAlignment = Enum.TextXAlignment.Left; status.Parent = frame

local submit = Instance.new("TextButton")
submit.Size = UDim2.new(1, -28, 0, 34); submit.Position = UDim2.new(0, 14, 0, 112); submit.BackgroundColor3 = Color3.fromRGB(80, 120, 255)
submit.BorderSizePixel = 0; submit.Text = "Unlock"; submit.TextColor3 = Color3.new(1, 1, 1); submit.Font = Enum.Font.GothamBold
submit.TextSize = 14; submit.Parent = frame
Instance.new("UICorner", submit).CornerRadius = UDim.new(0, 6)

local freeKey = Instance.new("TextButton")
freeKey.Size = UDim2.new(1, -28, 0, 30); freeKey.Position = UDim2.new(0, 14, 0, 154); freeKey.BackgroundColor3 = Color3.fromRGB(38, 38, 52)
freeKey.BorderSizePixel = 0; freeKey.Text = "Get Free Key"; freeKey.TextColor3 = Color3.fromRGB(200, 200, 220); freeKey.Font = Enum.Font.GothamMedium
freeKey.TextSize = 13; freeKey.AutoButtonColor = false; freeKey.Parent = frame
Instance.new("UICorner", freeKey).CornerRadius = UDim.new(0, 6)
freeKey.MouseButton1Click:Connect(function()
    local copied = copyToClipboard(DISCORD_INVITE)
    freeKey.Text = copied and "Copied Discord invite!" or "Copy failed — join discord.gg/uVXQTGefvq"
    freeKey.TextColor3 = copied and Color3.fromRGB(120, 220, 140) or Color3.fromRGB(255, 120, 120)
    task.delay(1.4, function()
        if freeKey and freeKey.Parent then
            freeKey.Text = "Get Free Key"; freeKey.TextColor3 = Color3.fromRGB(200, 200, 220)
        end
    end)
end)

local busy = false
local function attempt()
    if busy then return end
    busy = true
    submit.Text = "Checking..."; status.Text = ""
    task.spawn(function()
        local good, payload = tryKey(box.Text)
        if good then
            saveKey(box.Text)          -- remember it so relaunch auto-loads until it expires
            result = payload; done = true
        else
            status.Text = payload
            submit.Text = "Unlock"
            busy = false
        end
    end)
end
submit.MouseButton1Click:Connect(attempt)
box.FocusLost:Connect(function(enter) if enter then attempt() end end)

local close = Instance.new("TextButton")
close.Size = UDim2.new(0, 28, 0, 28); close.Position = UDim2.new(1, -34, 0, 10); close.BackgroundTransparency = 1
close.Text = "X"; close.TextColor3 = Color3.fromRGB(180, 180, 200); close.Font = Enum.Font.GothamBold; close.TextSize = 16; close.Parent = frame
close.MouseButton1Click:Connect(function() result = nil; done = true end)

while not done do task.wait() end
pcall(function() releaseMouse(); gui:Destroy() end)

if result then runHub(result) end

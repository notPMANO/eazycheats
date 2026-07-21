-- EazyCheats GUI Library
-- Then build your UI with Hub:AddTab(), tab:AddToggle(), etc.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local ContextActionService = game:GetService("ContextActionService")
local player = Players.LocalPlayer

-- ═══════════════════════════════════════
-- COLORS (edit these to retheme)
-- ═══════════════════════════════════════
local COLORS = {
    background = Color3.fromRGB(25, 25, 35),
    topbar = Color3.fromRGB(35, 35, 50),
    sidebar = Color3.fromRGB(20, 20, 30),
    tabActive = Color3.fromRGB(90, 60, 220),
    tabHover = Color3.fromRGB(45, 45, 65),
    tabInactive = Color3.fromRGB(20, 20, 30),
    accent = Color3.fromRGB(90, 60, 220),
    text = Color3.fromRGB(230, 230, 240),
    textDim = Color3.fromRGB(140, 140, 160),
    toggleOn = Color3.fromRGB(90, 60, 220),
    toggleOff = Color3.fromRGB(60, 60, 75),
    toggleKnob = Color3.fromRGB(255, 255, 255),
    sliderBg = Color3.fromRGB(40, 40, 55),
    sliderFill = Color3.fromRGB(90, 60, 220),
    contentBg = Color3.fromRGB(30, 30, 42),
    border = Color3.fromRGB(50, 50, 70),
    dropdownBg = Color3.fromRGB(35, 35, 48),
    dropdownItem = Color3.fromRGB(40, 40, 55),
    dropdownItemHover = Color3.fromRGB(55, 55, 75),
    dropdownItemActive = Color3.fromRGB(90, 60, 220),
    sectionBg = Color3.fromRGB(28, 28, 40),
    notifyBg = Color3.fromRGB(35, 35, 50),
}

local WINDOW_SIZE = UDim2.new(0, 580, 0, 400)
local WINDOW_MIN_SIZE = UDim2.new(0, 580, 0, 40)

-- ═══════════════════════════════════════
-- UTILITY
-- ═══════════════════════════════════════
local function tween(obj, time, props)
    TweenService:Create(obj, TweenInfo.new(time, Enum.EasingStyle.Quart, Enum.EasingDirection.Out), props):Play()
end

local function makeCorner(parent, radius)
    local c = Instance.new("UICorner")
    c.CornerRadius = UDim.new(0, radius or 6)
    c.Parent = parent
    return c
end

local function makeStroke(parent, color, thickness)
    local s = Instance.new("UIStroke")
    s.Color = color or COLORS.border
    s.Thickness = thickness or 1
    s.Parent = parent
    return s
end

-- Keys that should never be accepted as a keybind (they interfere with normal play/UI).
local BLOCKED_KEYS = {
    [Enum.KeyCode.Unknown] = true,
    [Enum.KeyCode.Escape] = true,
    [Enum.KeyCode.LeftShift] = true,
    [Enum.KeyCode.RightShift] = true,
    [Enum.KeyCode.LeftControl] = true,
    [Enum.KeyCode.RightControl] = true,
    [Enum.KeyCode.LeftAlt] = true,
    [Enum.KeyCode.RightAlt] = true,
}

-- ═══════════════════════════════════════
-- LIBRARY
-- ═══════════════════════════════════════
local Library = {}
Library.__index = Library

-- Forward declaration so Library:AddTab (defined below) captures this as an upvalue.
local TabClass

function Library.new(config)
    local self = setmetatable({}, Library)
    config = config or {}

    self.title = config.Title or "EazyCheats"
    self.toggleKey = config.ToggleKey or Enum.KeyCode.RightShift
    self.tabs = {}
    self.activeTab = nil
    self.tabOrder = 0
    self.connections = {}   -- every RBXScriptConnection the library makes, for clean teardown
    self.destroyed = false
    -- Free the game's mouse while the menu is open (default on; pass FreeMouse=false to disable).
    self.freeMouse = config.FreeMouse ~= false
    -- Links shown on the built-in Information tab (override via config when known).
    self.discordLink = config.Discord or "https://discord.gg/N75kj4wffC"
    self.websiteLink = config.Website or "eazycheats.com"
    -- The Information tab is created automatically unless Information=false is passed.
    self.showInfoTab = config.Information ~= false
    -- Optional cleanup run by the Information tab's Unload button before Destroy().
    self.onUnload = config.OnUnload

    -- Destroy old GUI (previous session of this hub)
    local existing = player:FindFirstChild("PlayerGui") and player.PlayerGui:FindFirstChild("EazyCheats")
    if existing then existing:Destroy() end

    -- ScreenGui
    self.gui = Instance.new("ScreenGui")
    self.gui.Name = "EazyCheats"
    self.gui.ResetOnSpawn = false
    self.gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    self.gui.Parent = player:WaitForChild("PlayerGui")

    -- Main frame
    self.main = Instance.new("Frame")
    self.main.Name = "Main"
    self.main.Size = WINDOW_SIZE
    self.main.Position = UDim2.new(0.5, -290, 0.5, -200)
    self.main.BackgroundColor3 = COLORS.background
    self.main.BorderSizePixel = 0
    self.main.ClipsDescendants = true
    self.main.Parent = self.gui
    makeCorner(self.main, 10)
    makeStroke(self.main)

    -- Shadow
    local shadow = Instance.new("ImageLabel")
    shadow.Size = UDim2.new(1, 30, 1, 30)
    shadow.Position = UDim2.new(0, -15, 0, -15)
    shadow.BackgroundTransparency = 1
    shadow.Image = "rbxassetid://5554236805"
    shadow.ImageColor3 = Color3.fromRGB(0, 0, 0)
    shadow.ImageTransparency = 0.5
    shadow.ScaleType = Enum.ScaleType.Slice
    shadow.SliceCenter = Rect.new(23, 23, 277, 277)
    shadow.ZIndex = -1
    shadow.Parent = self.main

    -- Topbar
    self:_createTopbar()

    -- Sidebar
    self:_createSidebar()

    -- Content area
    self.contentArea = Instance.new("Frame")
    self.contentArea.Name = "ContentArea"
    self.contentArea.Size = UDim2.new(1, -141, 1, -40)
    self.contentArea.Position = UDim2.new(0, 141, 0, 40)
    self.contentArea.BackgroundColor3 = COLORS.contentBg
    self.contentArea.BorderSizePixel = 0
    self.contentArea.Parent = self.main

    -- Notification container (bottom-right, outside the main window)
    self.notifyContainer = Instance.new("Frame")
    self.notifyContainer.Name = "Notifications"
    self.notifyContainer.AnchorPoint = Vector2.new(1, 1)
    self.notifyContainer.Position = UDim2.new(1, -12, 1, -12)
    self.notifyContainer.Size = UDim2.new(0, 260, 1, -24)
    self.notifyContainer.BackgroundTransparency = 1
    self.notifyContainer.Parent = self.gui
    local notifyLayout = Instance.new("UIListLayout")
    notifyLayout.SortOrder = Enum.SortOrder.LayoutOrder
    notifyLayout.HorizontalAlignment = Enum.HorizontalAlignment.Right
    notifyLayout.VerticalAlignment = Enum.VerticalAlignment.Bottom
    notifyLayout.Padding = UDim.new(0, 6)
    notifyLayout.Parent = self.notifyContainer

    -- Menu toggle key
    self:_track(UserInputService.InputBegan:Connect(function(input, processed)
        if self.destroyed then return end
        if processed then return end
        if input.KeyCode == self.toggleKey then
            self.gui.Enabled = not self.gui.Enabled
        end
    end))

    -- === FREE MOUSE + SCROLL CONTROL WHILE OPEN ===
    -- Games lock the cursor to screen-center every frame for camera control. To use the
    -- menu we must re-free it every frame AFTER the camera runs, or the game re-locks it.
    -- BindToRenderStep at Camera priority + 1 guarantees our unlock is the last write.
    local MOUSE_BIND = "EC_FreeMouse"
    local SCROLL_BIND = "EC_SinkScroll"
    local mouseBound = false
    local scrollBound = false

    local function bindMouse()
        if mouseBound then return end
        mouseBound = true
        pcall(function()
            RunService:BindToRenderStep(MOUSE_BIND, Enum.RenderPriority.Camera.Value + 1, function()
                UserInputService.MouseBehavior = Enum.MouseBehavior.Default
                UserInputService.MouseIconEnabled = true
            end)
        end)
    end
    local function unbindMouse()
        if not mouseBound then return end
        mouseBound = false
        pcall(function() RunService:UnbindFromRenderStep(MOUSE_BIND) end)
    end

    -- Swallow the mouse wheel so the game camera can't zoom (and can't drop into
    -- first-person, which is what snaps the cursor to screen-center on scroll).
    -- GUI ScrollingFrames are processed before this in the input pipeline, so the
    -- menu's own scrolling still works normally.
    local function bindScroll()
        if scrollBound then return end
        scrollBound = true
        pcall(function()
            ContextActionService:BindActionAtPriority(SCROLL_BIND, function()
                return Enum.ContextActionResult.Sink
            end, false, Enum.ContextActionPriority.High.Value, Enum.UserInputType.MouseWheel)
        end)
    end
    local function unbindScroll()
        if not scrollBound then return end
        scrollBound = false
        pcall(function() ContextActionService:UnbindAction(SCROLL_BIND) end)
    end

    -- Release everything back to the game (used by close, SetFreeMouse(false), Destroy).
    local function releaseInput()
        unbindMouse()
        unbindScroll()
    end
    self._releaseInput = releaseInput

    -- Sync the mouse/scroll capture to whether the window is open (covers toggle key,
    -- close button, and Hide()/Show()/Toggle() all at once).
    self:_track(RunService.Heartbeat:Connect(function()
        if self.destroyed then return end
        if self.freeMouse and self.gui.Enabled then
            bindMouse()
            bindScroll()
        else
            releaseInput()
        end
    end))

    -- Always-present Information tab (created first, so it sits at the top and is
    -- selected by default; the hub's own tabs are added after it).
    if self.showInfoTab then
        self:_createInfoTab()
    end

    return self
end

-- Track a connection so Destroy() can tear it down.
function Library:_track(conn)
    table.insert(self.connections, conn)
    return conn
end

function Library:_createTopbar()
    local topbar = Instance.new("Frame")
    topbar.Name = "Topbar"
    topbar.Size = UDim2.new(1, 0, 0, 40)
    topbar.BackgroundColor3 = COLORS.topbar
    topbar.BorderSizePixel = 0
    topbar.Parent = self.main
    makeCorner(topbar, 10)

    local topFill = Instance.new("Frame")
    topFill.Size = UDim2.new(1, 0, 0, 14)
    topFill.Position = UDim2.new(0, 0, 1, -14)
    topFill.BackgroundColor3 = COLORS.topbar
    topFill.BorderSizePixel = 0
    topFill.Parent = topbar

    -- Title
    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(0, 200, 1, 0)
    title.Position = UDim2.new(0, 16, 0, 0)
    title.BackgroundTransparency = 1
    title.Text = self.title
    title.TextColor3 = COLORS.text
    title.TextSize = 16
    title.Font = Enum.Font.GothamBold
    title.TextXAlignment = Enum.TextXAlignment.Left
    title.Parent = topbar

    -- Close
    local closeBtn = Instance.new("TextButton")
    closeBtn.Size = UDim2.new(0, 40, 0, 40)
    closeBtn.Position = UDim2.new(1, -40, 0, 0)
    closeBtn.BackgroundTransparency = 1
    closeBtn.Text = "×"
    closeBtn.TextColor3 = COLORS.textDim
    closeBtn.TextSize = 22
    closeBtn.Font = Enum.Font.GothamBold
    closeBtn.Parent = topbar
    closeBtn.MouseEnter:Connect(function() closeBtn.TextColor3 = Color3.fromRGB(255, 80, 80) end)
    closeBtn.MouseLeave:Connect(function() closeBtn.TextColor3 = COLORS.textDim end)
    closeBtn.MouseButton1Click:Connect(function() self.gui.Enabled = false end)

    -- Minimize
    local minBtn = Instance.new("TextButton")
    minBtn.Size = UDim2.new(0, 40, 0, 40)
    minBtn.Position = UDim2.new(1, -76, 0, 0)
    minBtn.BackgroundTransparency = 1
    minBtn.Text = "–"
    minBtn.TextColor3 = COLORS.textDim
    minBtn.TextSize = 22
    minBtn.Font = Enum.Font.GothamBold
    minBtn.Parent = topbar
    minBtn.MouseEnter:Connect(function() minBtn.TextColor3 = COLORS.text end)
    minBtn.MouseLeave:Connect(function() minBtn.TextColor3 = COLORS.textDim end)

    local minimized = false
    minBtn.MouseButton1Click:Connect(function()
        minimized = not minimized
        -- Restore to whatever the window's full size currently is, not a hardcoded value.
        tween(self.main, 0.25, {Size = minimized and WINDOW_MIN_SIZE or self.fullSize or WINDOW_SIZE})
    end)
    self.fullSize = WINDOW_SIZE

    -- Dragging (with on-screen bounds so the window can't be lost)
    local dragging, dragStart, startPos
    topbar.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = true
            dragStart = input.Position
            startPos = self.main.Position
        end
    end)
    topbar.InputEnded:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = false
        end
    end)
    self:_track(UserInputService.InputChanged:Connect(function(input)
        if self.destroyed then return end
        if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            local d = input.Position - dragStart
            local newX = startPos.X.Offset + d.X
            local newY = startPos.Y.Offset + d.Y
            -- Clamp so at least part of the topbar stays on screen.
            local viewport = workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(1920, 1080)
            local mainSize = self.main.AbsoluteSize
            local minX = -mainSize.X + 60
            local maxX = viewport.X - 60
            local minY = 0
            local maxY = viewport.Y - 40
            -- Position uses scale 0.5 anchor origin, so convert against that baseline.
            newX = math.clamp(newX, minX - (viewport.X * startPos.X.Scale), maxX - (viewport.X * startPos.X.Scale))
            newY = math.clamp(newY, minY - (viewport.Y * startPos.Y.Scale), maxY - (viewport.Y * startPos.Y.Scale))
            self.main.Position = UDim2.new(startPos.X.Scale, newX, startPos.Y.Scale, newY)
        end
    end))
end

function Library:_createSidebar()
    local sidebar = Instance.new("Frame")
    sidebar.Name = "Sidebar"
    sidebar.Size = UDim2.new(0, 140, 1, -40)
    sidebar.Position = UDim2.new(0, 0, 0, 40)
    sidebar.BackgroundColor3 = COLORS.sidebar
    sidebar.BorderSizePixel = 0
    sidebar.Parent = self.main

    local line = Instance.new("Frame")
    line.Size = UDim2.new(0, 1, 1, 0)
    line.Position = UDim2.new(1, 0, 0, 0)
    line.BackgroundColor3 = COLORS.border
    line.BorderSizePixel = 0
    line.Parent = sidebar

    self.tabList = Instance.new("ScrollingFrame")
    self.tabList.Name = "TabList"
    self.tabList.Size = UDim2.new(1, -12, 1, -12)
    self.tabList.Position = UDim2.new(0, 6, 0, 6)
    self.tabList.BackgroundTransparency = 1
    self.tabList.BorderSizePixel = 0
    self.tabList.ScrollBarThickness = 0
    self.tabList.CanvasSize = UDim2.new(0, 0, 0, 0)
    self.tabList.AutomaticCanvasSize = Enum.AutomaticSize.Y
    self.tabList.Parent = sidebar

    local layout = Instance.new("UIListLayout")
    layout.SortOrder = Enum.SortOrder.LayoutOrder
    layout.Padding = UDim.new(0, 4)
    layout.Parent = self.tabList
end

-- ═══════════════════════════════════════
-- WINDOW CONTROL METHODS
-- ═══════════════════════════════════════
function Library:Show() self.gui.Enabled = true end
function Library:Hide() self.gui.Enabled = false end
function Library:Toggle() self.gui.Enabled = not self.gui.Enabled end

function Library:SetToggleKey(key)
    if typeof(key) == "EnumItem" then
        self.toggleKey = key
    end
end

-- Enable/disable the free-mouse-while-open behavior at runtime.
function Library:SetFreeMouse(enabled)
    self.freeMouse = enabled and true or false
    if not self.freeMouse and self._releaseInput then
        self._releaseInput()   -- immediately hand mouse + scroll back to the game
    end
end

-- Full teardown: disconnect every tracked connection and destroy the GUI.
function Library:Destroy()
    if self.destroyed then return end
    self.destroyed = true
    if self._releaseInput then self._releaseInput() end   -- release mouse + scroll to the game
    for _, conn in ipairs(self.connections) do
        pcall(function() conn:Disconnect() end)
    end
    self.connections = {}
    pcall(function() self.gui:Destroy() end)
end

-- ═══════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════
function Library:Notify(text, duration)
    if self.destroyed then return end
    duration = duration or 3

    local card = Instance.new("Frame")
    card.Size = UDim2.new(1, 0, 0, 40)
    card.BackgroundColor3 = COLORS.notifyBg
    card.BackgroundTransparency = 1
    card.BorderSizePixel = 0
    card.Parent = self.notifyContainer
    makeCorner(card, 6)
    local stroke = makeStroke(card, COLORS.accent, 1)
    stroke.Transparency = 1

    local accentBar = Instance.new("Frame")
    accentBar.Size = UDim2.new(0, 3, 1, -8)
    accentBar.Position = UDim2.new(0, 4, 0, 4)
    accentBar.BackgroundColor3 = COLORS.accent
    accentBar.BorderSizePixel = 0
    accentBar.BackgroundTransparency = 1
    accentBar.Parent = card
    makeCorner(accentBar, 2)

    local msg = Instance.new("TextLabel")
    msg.Size = UDim2.new(1, -20, 1, 0)
    msg.Position = UDim2.new(0, 14, 0, 0)
    msg.BackgroundTransparency = 1
    msg.Text = text or ""
    msg.TextColor3 = COLORS.text
    msg.TextTransparency = 1
    msg.TextSize = 12
    msg.Font = Enum.Font.GothamMedium
    msg.TextXAlignment = Enum.TextXAlignment.Left
    msg.TextWrapped = true
    msg.Parent = card

    tween(card, 0.2, {BackgroundTransparency = 0.05})
    tween(stroke, 0.2, {Transparency = 0.4})
    tween(accentBar, 0.2, {BackgroundTransparency = 0})
    tween(msg, 0.2, {TextTransparency = 0})

    task.delay(duration, function()
        tween(card, 0.25, {BackgroundTransparency = 1})
        tween(stroke, 0.25, {Transparency = 1})
        tween(accentBar, 0.25, {BackgroundTransparency = 1})
        tween(msg, 0.25, {TextTransparency = 1})
        task.wait(0.3)
        card:Destroy()
    end)
end

-- ═══════════════════════════════════════
-- ADD TAB
-- ═══════════════════════════════════════
function Library:AddTab(config)
    config = config or {}
    local name = config.Name or ("Tab " .. (#self.tabs + 1))
    local icon = config.Icon or ""

    self.tabOrder = self.tabOrder + 1
    local tab = setmetatable({}, TabClass)
    tab.name = name
    tab.library = self
    tab.elements = {}
    tab.layoutOrder = 0

    -- Tab button
    local btn = Instance.new("TextButton")
    btn.Name = name
    btn.Size = UDim2.new(1, 0, 0, 36)
    btn.BackgroundColor3 = COLORS.tabInactive
    btn.BorderSizePixel = 0
    btn.Text = ""
    btn.LayoutOrder = self.tabOrder
    btn.AutoButtonColor = false
    btn.Parent = self.tabList
    makeCorner(btn, 6)

    local indicator = Instance.new("Frame")
    indicator.Name = "Indicator"
    indicator.Size = UDim2.new(0, 3, 0, 20)
    indicator.Position = UDim2.new(0, 0, 0.5, -10)
    indicator.BackgroundColor3 = COLORS.accent
    indicator.BackgroundTransparency = 1
    indicator.BorderSizePixel = 0
    indicator.Parent = btn
    makeCorner(indicator, 2)

    local iconLabel = Instance.new("TextLabel")
    iconLabel.Name = "Icon"
    iconLabel.Size = UDim2.new(0, 28, 1, 0)
    iconLabel.Position = UDim2.new(0, 8, 0, 0)
    iconLabel.BackgroundTransparency = 1
    iconLabel.Text = icon
    iconLabel.TextColor3 = COLORS.textDim
    iconLabel.TextSize = 14
    iconLabel.Font = Enum.Font.GothamMedium
    iconLabel.Parent = btn

    local label = Instance.new("TextLabel")
    label.Name = "Label"
    label.Size = UDim2.new(1, -40, 1, 0)
    label.Position = UDim2.new(0, 36, 0, 0)
    label.BackgroundTransparency = 1
    label.Text = name
    label.TextColor3 = COLORS.textDim
    label.TextSize = 13
    label.Font = Enum.Font.GothamMedium
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Parent = btn

    -- Content page
    local page = Instance.new("ScrollingFrame")
    page.Name = name
    page.Size = UDim2.new(1, -16, 1, -16)
    page.Position = UDim2.new(0, 8, 0, 8)
    page.BackgroundTransparency = 1
    page.BorderSizePixel = 0
    page.ScrollBarThickness = 3
    page.ScrollBarImageColor3 = COLORS.accent
    page.CanvasSize = UDim2.new(0, 0, 0, 0)
    page.AutomaticCanvasSize = Enum.AutomaticSize.Y
    page.Visible = false
    page.Parent = self.contentArea

    local pageLayout = Instance.new("UIListLayout")
    pageLayout.SortOrder = Enum.SortOrder.LayoutOrder
    pageLayout.Padding = UDim.new(0, 6)
    pageLayout.Parent = page

    local pagePad = Instance.new("UIPadding")
    pagePad.PaddingTop = UDim.new(0, 4)
    pagePad.PaddingBottom = UDim.new(0, 4)
    pagePad.Parent = page

    tab.button = btn
    tab.indicator = indicator
    tab.iconLabel = iconLabel
    tab.label = label
    tab.page = page

    self.tabs[name] = tab

    -- Switch on click
    btn.MouseEnter:Connect(function()
        if self.activeTab ~= name then
            tween(btn, 0.15, {BackgroundColor3 = COLORS.tabHover})
        end
    end)
    btn.MouseLeave:Connect(function()
        if self.activeTab ~= name then
            tween(btn, 0.15, {BackgroundColor3 = COLORS.tabInactive})
        end
    end)
    btn.MouseButton1Click:Connect(function()
        self:_switchTab(name)
    end)

    -- Auto-select first tab
    if self.activeTab == nil then
        self:_switchTab(name)
    end

    return tab
end

function Library:_switchTab(name)
    if self.activeTab == name then return end
    self.activeTab = name
    for tabName, tab in pairs(self.tabs) do
        local active = tabName == name
        tween(tab.button, 0.2, {BackgroundColor3 = active and COLORS.tabActive or COLORS.tabInactive})
        tab.label.TextColor3 = active and COLORS.text or COLORS.textDim
        tab.iconLabel.TextColor3 = active and COLORS.text or COLORS.textDim
        tab.indicator.BackgroundTransparency = active and 0 or 1
        tab.page.Visible = active
    end
end

-- Reads this executor's hardware id (best-effort across executors).
local function readHWID()
    local h
    pcall(function() if gethwid then h = gethwid() end end)
    if h == nil or tostring(h) == "" then
        pcall(function() h = game:GetService("RbxAnalyticsService"):GetClientId() end)
    end
    return tostring(h or "unknown")
end

-- Builds the built-in Information tab (identity + links).
function Library:_createInfoTab()
    local tab = self:AddTab({ Name = "Information", Icon = "i" })

    tab:AddSection("EazyCheats")

    local account = player.Name
    if player.DisplayName and player.DisplayName ~= player.Name then
        account = player.DisplayName .. " (@" .. player.Name .. ")"
    end

    tab:_addInfoRow("Account", account, true)
    tab:_addInfoRow("HWID", readHWID(), true)
    tab:_addInfoRow("Discord", self.discordLink, true)
    tab:_addInfoRow("Website", self.websiteLink, true)

    -- Unload button at the bottom: runs the optional cleanup hook, then tears the
    -- whole menu down (disconnects every tracked connection and destroys the GUI).
    tab:AddSection("")
    local lib = self
    tab:AddButton({
        Name = "Unload EazyCheats",
        Callback = function()
            if lib.onUnload then pcall(lib.onUnload) end
            lib:Destroy()
        end,
    })

    return tab
end

-- ═══════════════════════════════════════
-- TAB CLASS (components)
-- ═══════════════════════════════════════
-- NOTE: local (forward-declared above), so it does not leak into the global environment.
TabClass = {}
TabClass.__index = TabClass

-- Shortcut to the owning library's connection tracker.
function TabClass:_track(conn)
    return self.library:_track(conn)
end

-- Attaches an optional hover tooltip to a frame if config.Tooltip is set.
function TabClass:_attachTooltip(frame, tooltipText)
    if not tooltipText or tooltipText == "" then return end
    local tip = Instance.new("TextLabel")
    tip.Name = "Tooltip"
    tip.AutomaticSize = Enum.AutomaticSize.XY
    tip.BackgroundColor3 = COLORS.background
    tip.Text = "  " .. tooltipText .. "  "
    tip.TextColor3 = COLORS.text
    tip.TextSize = 11
    tip.Font = Enum.Font.Gotham
    tip.Visible = false
    tip.ZIndex = 50
    tip.Position = UDim2.new(0, 12, 0, -4)
    tip.AnchorPoint = Vector2.new(0, 1)
    tip.Parent = frame
    makeCorner(tip, 4)
    makeStroke(tip, COLORS.accent, 1)
    frame.MouseEnter:Connect(function() tip.Visible = true end)
    frame.MouseLeave:Connect(function() tip.Visible = false end)
end

-- Registers an element object + its root frame so the tab can bulk-manage them.
function TabClass:_register(obj, frame)
    obj.instance = frame
    obj.SetVisible = function(_, visible)
        frame.Visible = visible
    end
    table.insert(self.elements, obj)
    return obj
end

-- Section header
function TabClass:AddSection(name)
    self.layoutOrder = self.layoutOrder + 1
    local section = Instance.new("TextLabel")
    section.Size = UDim2.new(1, 0, 0, 28)
    section.BackgroundTransparency = 1
    section.Text = name or "Section"
    section.TextColor3 = COLORS.accent
    section.TextSize = 12
    section.Font = Enum.Font.GothamBold
    section.TextXAlignment = Enum.TextXAlignment.Left
    section.LayoutOrder = self.layoutOrder
    section.Parent = self.page

    local pad = Instance.new("UIPadding")
    pad.PaddingLeft = UDim.new(0, 4)
    pad.Parent = section

    return section
end

-- Read-only "label: value" row. If copyable, clicking copies the value to the
-- clipboard (used by the Information tab for HWID, links, etc.).
function TabClass:_addInfoRow(name, value, copyable)
    value = tostring(value)
    self.layoutOrder = self.layoutOrder + 1

    local frame = Instance.new(copyable and "TextButton" or "Frame")
    frame.Size = UDim2.new(1, 0, 0, 34)
    frame.BackgroundColor3 = COLORS.sectionBg
    frame.BorderSizePixel = 0
    frame.LayoutOrder = self.layoutOrder
    if copyable then
        frame.Text = ""
        frame.AutoButtonColor = false
    end
    frame.Parent = self.page
    makeCorner(frame, 6)

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(0, 84, 1, 0)
    label.Position = UDim2.new(0, 12, 0, 0)
    label.BackgroundTransparency = 1
    label.Text = name
    label.TextColor3 = COLORS.textDim
    label.TextSize = 12
    label.Font = Enum.Font.GothamMedium
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Parent = frame

    local val = Instance.new("TextLabel")
    val.Size = UDim2.new(1, -108, 1, 0)
    val.Position = UDim2.new(0, 96, 0, 0)
    val.BackgroundTransparency = 1
    val.Text = value
    val.TextColor3 = COLORS.text
    val.TextSize = 12
    val.Font = Enum.Font.Gotham
    val.TextXAlignment = Enum.TextXAlignment.Right
    val.TextTruncate = Enum.TextTruncate.AtEnd
    val.Parent = frame

    if copyable then
        -- On click: copy to clipboard and flash a little "Copied to clipboard" sign
        -- (no hover tooltip — the sign only appears once you actually click).
        frame.MouseButton1Click:Connect(function()
            local clip = setclipboard or (syn and syn.write_clipboard) or toclipboard or set_clipboard
            local ok = clip ~= nil and pcall(clip, value)

            local sign = Instance.new("TextLabel")
            sign.Name = "CopySign"
            sign.AutomaticSize = Enum.AutomaticSize.XY
            sign.BackgroundColor3 = COLORS.background
            sign.Text = "  " .. (ok and "Copied to clipboard" or "Copy failed") .. "  "
            sign.TextColor3 = COLORS.text
            sign.TextSize = 11
            sign.Font = Enum.Font.GothamMedium
            sign.ZIndex = 50
            sign.Position = UDim2.new(0, 12, 0, -4)
            sign.AnchorPoint = Vector2.new(0, 1)
            sign.Parent = frame
            makeCorner(sign, 4)
            makeStroke(sign, COLORS.accent, 1)
            task.delay(1.0, function()
                if sign and sign.Parent then sign:Destroy() end
            end)
        end)
    end

    return frame
end

-- Toggle switch, optionally with an inline keybind box.
--   config.Keybind: pass `true` for a bindable toggle that starts unbound, or an
--     Enum.KeyCode for a default bind. Omit it entirely for a plain toggle.
--   Click the little key box → it shows "..." and waits; the next key sets the
--     bind, and Escape clears it (unbound). The bound key toggles the feature.
--   config.KeybindChanged(key): optional, fired when the bind changes (for saving).
function TabClass:AddToggle(config)
    config = config or {}
    local name = config.Name or "Toggle"
    local default = config.Default or false
    local callback = config.Callback or function() end
    local keybindChanged = config.KeybindChanged or function() end

    -- A keybind box is shown when config.Keybind is `true` or an actual KeyCode.
    local bindable = config.Keybind ~= nil and config.Keybind ~= false
    local key = Enum.KeyCode.Unknown
    if typeof(config.Keybind) == "EnumItem" then key = config.Keybind end

    self.layoutOrder = self.layoutOrder + 1
    local state = default
    local listening = false

    local frame = Instance.new("TextButton")
    frame.Size = UDim2.new(1, 0, 0, 36)
    frame.BackgroundColor3 = COLORS.sectionBg
    frame.BorderSizePixel = 0
    frame.Text = ""
    frame.AutoButtonColor = false
    frame.LayoutOrder = self.layoutOrder
    frame.Parent = self.page
    makeCorner(frame, 6)

    local label = Instance.new("TextLabel")
    -- Leave extra room on the right for the key box when the toggle is bindable.
    label.Size = UDim2.new(1, bindable and -124 or -70, 1, 0)
    label.Position = UDim2.new(0, 12, 0, 0)
    label.BackgroundTransparency = 1
    label.Text = name
    label.TextColor3 = COLORS.text
    label.TextSize = 13
    label.Font = Enum.Font.GothamMedium
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Parent = frame

    -- Switch track
    local track = Instance.new("Frame")
    track.Size = UDim2.new(0, 40, 0, 20)
    track.Position = UDim2.new(1, -52, 0.5, -10)
    track.BackgroundColor3 = state and COLORS.toggleOn or COLORS.toggleOff
    track.BorderSizePixel = 0
    track.Parent = frame
    makeCorner(track, 10)

    -- Switch knob
    local knob = Instance.new("Frame")
    knob.Size = UDim2.new(0, 16, 0, 16)
    knob.Position = state and UDim2.new(1, -18, 0.5, -8) or UDim2.new(0, 2, 0.5, -8)
    knob.BackgroundColor3 = COLORS.toggleKnob
    knob.BorderSizePixel = 0
    knob.Parent = track
    makeCorner(knob, 8)

    local toggleObj = { Value = state, Key = key }

    local function keyText()
        return key == Enum.KeyCode.Unknown and "None" or key.Name
    end

    -- Optional inline keybind box (sits just left of the switch).
    local bindBtn
    if bindable then
        bindBtn = Instance.new("TextButton")
        bindBtn.Size = UDim2.new(0, 58, 0, 22)
        bindBtn.Position = UDim2.new(1, -114, 0.5, -11)
        bindBtn.BackgroundColor3 = COLORS.sliderBg
        bindBtn.BorderSizePixel = 0
        bindBtn.Text = keyText()
        bindBtn.TextColor3 = COLORS.textDim
        bindBtn.TextSize = 11
        bindBtn.Font = Enum.Font.GothamMedium
        bindBtn.AutoButtonColor = false
        bindBtn.Parent = frame
        makeCorner(bindBtn, 4)
        bindBtn.MouseButton1Click:Connect(function()
            listening = true
            bindBtn.Text = "..."
            bindBtn.TextColor3 = COLORS.accent
        end)
    end

    local function update()
        tween(track, 0.2, {BackgroundColor3 = state and COLORS.toggleOn or COLORS.toggleOff})
        tween(knob, 0.2, {Position = state and UDim2.new(1, -18, 0.5, -8) or UDim2.new(0, 2, 0.5, -8)})
        toggleObj.Value = state
    end

    local function flip()
        state = not state
        update()
        callback(state)
    end

    frame.MouseButton1Click:Connect(flip)

    -- Bindable toggles listen for key input: rebinding while the box says "...",
    -- and firing the toggle when the bound key is pressed during play.
    if bindable then
        self:_track(UserInputService.InputBegan:Connect(function(input, processed)
            if self.library.destroyed then return end

            if listening then
                if input.UserInputType ~= Enum.UserInputType.Keyboard then return end
                -- Escape clears the bind entirely (feature stays, just no hotkey).
                if input.KeyCode == Enum.KeyCode.Escape then
                    key = Enum.KeyCode.Unknown
                    toggleObj.Key = key
                    bindBtn.Text = keyText()
                    bindBtn.TextColor3 = COLORS.textDim
                    listening = false
                    keybindChanged(key)
                    return
                end
                if BLOCKED_KEYS[input.KeyCode] then return end
                key = input.KeyCode
                toggleObj.Key = key
                bindBtn.Text = keyText()
                bindBtn.TextColor3 = COLORS.textDim
                listening = false
                keybindChanged(key)
                return
            end

            if processed then return end
            if key ~= Enum.KeyCode.Unknown and input.KeyCode == key then
                flip()
            end
        end))
    end

    -- Set(val, silent?): silent=true updates visuals/value without firing the callback.
    toggleObj.Set = function(_, val, silent)
        state = val and true or false
        update()
        if not silent then callback(state) end
    end

    -- SetKey(newKey, silent?): rebind, or pass nil / Enum.KeyCode.Unknown to clear.
    toggleObj.SetKey = function(_, newKey, silent)
        if typeof(newKey) == "EnumItem" then
            key = newKey
        elseif newKey == nil then
            key = Enum.KeyCode.Unknown
        end
        toggleObj.Key = key
        if bindBtn then
            bindBtn.Text = keyText()
            bindBtn.TextColor3 = COLORS.textDim
        end
        if not silent then keybindChanged(key) end
    end

    self:_attachTooltip(frame, config.Tooltip)
    return self:_register(toggleObj, frame)
end

-- Slider
function TabClass:AddSlider(config)
    config = config or {}
    local name = config.Name or "Slider"
    local min = config.Min or 0
    local max = config.Max or 100
    local default = math.clamp(config.Default or min, min, max)
    local callback = config.Callback or function() end

    self.layoutOrder = self.layoutOrder + 1
    local value = default

    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, 0, 0, 50)
    frame.BackgroundColor3 = COLORS.sectionBg
    frame.BorderSizePixel = 0
    frame.LayoutOrder = self.layoutOrder
    frame.Parent = self.page
    makeCorner(frame, 6)

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, -60, 0, 24)
    label.Position = UDim2.new(0, 12, 0, 2)
    label.BackgroundTransparency = 1
    label.Text = name
    label.TextColor3 = COLORS.text
    label.TextSize = 13
    label.Font = Enum.Font.GothamMedium
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Parent = frame

    local valLabel = Instance.new("TextLabel")
    valLabel.Size = UDim2.new(0, 50, 0, 24)
    valLabel.Position = UDim2.new(1, -58, 0, 2)
    valLabel.BackgroundTransparency = 1
    valLabel.Text = tostring(math.floor(value))
    valLabel.TextColor3 = COLORS.accent
    valLabel.TextSize = 13
    valLabel.Font = Enum.Font.GothamBold
    valLabel.TextXAlignment = Enum.TextXAlignment.Right
    valLabel.Parent = frame

    -- Slider track
    local trackBg = Instance.new("Frame")
    trackBg.Size = UDim2.new(1, -24, 0, 6)
    trackBg.Position = UDim2.new(0, 12, 0, 34)
    trackBg.BackgroundColor3 = COLORS.sliderBg
    trackBg.BorderSizePixel = 0
    trackBg.Parent = frame
    makeCorner(trackBg, 3)

    local startRel = (value - min) / (max - min)
    local fill = Instance.new("Frame")
    fill.Size = UDim2.new(startRel, 0, 1, 0)
    fill.BackgroundColor3 = COLORS.sliderFill
    fill.BorderSizePixel = 0
    fill.Parent = trackBg
    makeCorner(fill, 3)

    -- Knob
    local sliderKnob = Instance.new("Frame")
    sliderKnob.Size = UDim2.new(0, 14, 0, 14)
    sliderKnob.Position = UDim2.new(startRel, -7, 0.5, -7)
    sliderKnob.BackgroundColor3 = COLORS.toggleKnob
    sliderKnob.BorderSizePixel = 0
    sliderKnob.ZIndex = 2
    sliderKnob.Parent = trackBg
    makeCorner(sliderKnob, 7)

    local sliderObj = { Value = value }
    local sliding = false

    local function updateSlider(inputX)
        local trackAbsPos = trackBg.AbsolutePosition.X
        local trackAbsSize = trackBg.AbsoluteSize.X
        local relative = math.clamp((inputX - trackAbsPos) / trackAbsSize, 0, 1)
        value = math.floor(min + (max - min) * relative)
        fill.Size = UDim2.new(relative, 0, 1, 0)
        sliderKnob.Position = UDim2.new(relative, -7, 0.5, -7)
        valLabel.Text = tostring(value)
        sliderObj.Value = value
        callback(value)
    end

    trackBg.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            sliding = true
            updateSlider(input.Position.X)
        end
    end)

    sliderKnob.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            sliding = true
        end
    end)

    self:_track(UserInputService.InputEnded:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            sliding = false
        end
    end))

    self:_track(UserInputService.InputChanged:Connect(function(input)
        if sliding and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            updateSlider(input.Position.X)
        end
    end))

    -- Set(val, silent?): clamps to [min,max]; silent=true skips the callback.
    sliderObj.Set = function(_, val, silent)
        val = math.clamp(val, min, max)
        value = val
        local relative = (val - min) / (max - min)
        fill.Size = UDim2.new(relative, 0, 1, 0)
        sliderKnob.Position = UDim2.new(relative, -7, 0.5, -7)
        valLabel.Text = tostring(math.floor(val))
        sliderObj.Value = val
        if not silent then callback(val) end
    end

    self:_attachTooltip(frame, config.Tooltip)
    return self:_register(sliderObj, frame)
end

-- Dropdown (single select or multi select)
function TabClass:AddDropdown(config)
    config = config or {}
    local name = config.Name or "Dropdown"
    local items = config.Items or {}
    local default = config.Default
    local multi = config.Multi or false
    local callback = config.Callback or function() end

    self.layoutOrder = self.layoutOrder + 1

    local opened = false
    local selected = multi and {} or nil

    if multi and type(default) == "table" then
        for _, v in ipairs(default) do selected[v] = true end
    elseif not multi and default then
        selected = default
    end

    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, 0, 0, 36)
    frame.BackgroundColor3 = COLORS.sectionBg
    frame.BorderSizePixel = 0
    frame.LayoutOrder = self.layoutOrder
    frame.ClipsDescendants = true
    frame.Parent = self.page
    makeCorner(frame, 6)

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, -40, 0, 36)
    label.Position = UDim2.new(0, 12, 0, 0)
    label.BackgroundTransparency = 1
    label.Text = name
    label.TextColor3 = COLORS.text
    label.TextSize = 13
    label.Font = Enum.Font.GothamMedium
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Parent = frame

    -- Arrow
    local arrow = Instance.new("TextLabel")
    arrow.Size = UDim2.new(0, 30, 0, 36)
    arrow.Position = UDim2.new(1, -36, 0, 0)
    arrow.BackgroundTransparency = 1
    arrow.Text = "▼"
    arrow.TextColor3 = COLORS.textDim
    arrow.TextSize = 10
    arrow.Font = Enum.Font.GothamBold
    arrow.Parent = frame

    -- Selection display
    local selDisplay = Instance.new("TextLabel")
    selDisplay.Size = UDim2.new(0.5, -20, 0, 36)
    selDisplay.Position = UDim2.new(0.4, 0, 0, 0)
    selDisplay.BackgroundTransparency = 1
    selDisplay.TextColor3 = COLORS.textDim
    selDisplay.TextSize = 12
    selDisplay.Font = Enum.Font.Gotham
    selDisplay.TextXAlignment = Enum.TextXAlignment.Right
    selDisplay.TextTruncate = Enum.TextTruncate.AtEnd
    selDisplay.Parent = frame

    -- Items container
    local itemContainer = Instance.new("Frame")
    itemContainer.Name = "Items"
    itemContainer.Size = UDim2.new(1, -8, 0, 0)
    itemContainer.Position = UDim2.new(0, 4, 0, 38)
    itemContainer.BackgroundTransparency = 1
    itemContainer.BorderSizePixel = 0
    itemContainer.Parent = frame

    local itemLayout = Instance.new("UIListLayout")
    itemLayout.SortOrder = Enum.SortOrder.LayoutOrder
    itemLayout.Padding = UDim.new(0, 2)
    itemLayout.Parent = itemContainer

    local function getDisplayText()
        if multi then
            local parts = {}
            for _, item in ipairs(items) do
                if selected[item] then table.insert(parts, item) end
            end
            return #parts > 0 and table.concat(parts, ", ") or "None"
        else
            return selected or "None"
        end
    end

    local function updateDisplay()
        selDisplay.Text = getDisplayText()
    end

    local itemButtons = {}

    -- Shared item-button builder (used by both initial build and Refresh).
    local function buildItem(i, item)
        local itemBtn = Instance.new("TextButton")
        itemBtn.Size = UDim2.new(1, 0, 0, 30)
        itemBtn.BackgroundColor3 = COLORS.dropdownItem
        itemBtn.BorderSizePixel = 0
        itemBtn.Text = ""
        itemBtn.AutoButtonColor = false
        itemBtn.LayoutOrder = i
        itemBtn.Parent = itemContainer
        makeCorner(itemBtn, 4)

        local itemLabel = Instance.new("TextLabel")
        itemLabel.Size = UDim2.new(1, -36, 1, 0)
        itemLabel.Position = UDim2.new(0, 10, 0, 0)
        itemLabel.BackgroundTransparency = 1
        itemLabel.Text = item
        itemLabel.TextColor3 = COLORS.text
        itemLabel.TextSize = 12
        itemLabel.Font = Enum.Font.Gotham
        itemLabel.TextXAlignment = Enum.TextXAlignment.Left
        itemLabel.Parent = itemBtn

        local check = Instance.new("TextLabel")
        check.Name = "Check"
        check.Size = UDim2.new(0, 20, 1, 0)
        check.Position = UDim2.new(1, -26, 0, 0)
        check.BackgroundTransparency = 1
        check.TextSize = 12
        check.Font = Enum.Font.GothamBold
        check.Parent = itemBtn

        local function updateItem()
            local isActive
            if multi then
                isActive = selected[item] == true
            else
                isActive = selected == item
            end
            check.Text = isActive and "✓" or ""
            check.TextColor3 = isActive and COLORS.accent or COLORS.textDim
            itemBtn.BackgroundColor3 = isActive and COLORS.dropdownItemActive or COLORS.dropdownItem
        end

        itemBtn.MouseEnter:Connect(function()
            local isActive = multi and selected[item] or selected == item
            if not isActive then
                tween(itemBtn, 0.1, {BackgroundColor3 = COLORS.dropdownItemHover})
            end
        end)
        itemBtn.MouseLeave:Connect(function()
            local isActive = multi and selected[item] or selected == item
            if not isActive then
                tween(itemBtn, 0.1, {BackgroundColor3 = COLORS.dropdownItem})
            end
        end)

        itemBtn.MouseButton1Click:Connect(function()
            if multi then
                selected[item] = not selected[item] or nil
            else
                selected = item
            end
            for _, data in pairs(itemButtons) do data.update() end
            updateDisplay()
            callback(selected)
        end)

        itemButtons[item] = {btn = itemBtn, update = updateItem}
        updateItem()
    end

    for i, item in ipairs(items) do
        buildItem(i, item)
    end
    updateDisplay()

    -- Toggle dropdown open/close
    local headerBtn = Instance.new("TextButton")
    headerBtn.Size = UDim2.new(1, 0, 0, 36)
    headerBtn.BackgroundTransparency = 1
    headerBtn.Text = ""
    headerBtn.ZIndex = 2
    headerBtn.Parent = frame

    headerBtn.MouseButton1Click:Connect(function()
        opened = not opened
        local itemCount = #items
        local targetHeight = opened and (36 + 4 + itemCount * 32) or 36
        tween(frame, 0.25, {Size = UDim2.new(1, 0, 0, targetHeight)})
        arrow.Text = opened and "▲" or "▼"
    end)

    local dropdownObj = { Selected = selected }

    dropdownObj.Set = function(_, val, silent)
        selected = val
        dropdownObj.Selected = selected
        for _, data in pairs(itemButtons) do data.update() end
        updateDisplay()
        if not silent then callback(selected) end
    end

    dropdownObj.Refresh = function(_, newItems, keepSelection)
        items = newItems or {}
        if not keepSelection then
            selected = multi and {} or nil
            dropdownObj.Selected = selected
        end
        for _, data in pairs(itemButtons) do data.btn:Destroy() end
        itemButtons = {}
        for i, item in ipairs(items) do
            buildItem(i, item)
        end
        updateDisplay()
    end

    self:_attachTooltip(frame, config.Tooltip)
    return self:_register(dropdownObj, frame)
end

-- Keybind picker
function TabClass:AddKeybind(config)
    config = config or {}
    local name = config.Name or "Keybind"
    local default = config.Default or Enum.KeyCode.Unknown
    local callback = config.Callback or function() end
    local changed = config.Changed or function() end

    self.layoutOrder = self.layoutOrder + 1
    local key = default
    local listening = false

    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, 0, 0, 36)
    frame.BackgroundColor3 = COLORS.sectionBg
    frame.BorderSizePixel = 0
    frame.LayoutOrder = self.layoutOrder
    frame.Parent = self.page
    makeCorner(frame, 6)

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, -90, 1, 0)
    label.Position = UDim2.new(0, 12, 0, 0)
    label.BackgroundTransparency = 1
    label.Text = name
    label.TextColor3 = COLORS.text
    label.TextSize = 13
    label.Font = Enum.Font.GothamMedium
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Parent = frame

    local bindBtn = Instance.new("TextButton")
    bindBtn.Size = UDim2.new(0, 70, 0, 24)
    bindBtn.Position = UDim2.new(1, -80, 0.5, -12)
    bindBtn.BackgroundColor3 = COLORS.sliderBg
    bindBtn.BorderSizePixel = 0
    bindBtn.Text = (key == Enum.KeyCode.Unknown) and "None" or key.Name
    bindBtn.TextColor3 = COLORS.textDim
    bindBtn.TextSize = 11
    bindBtn.Font = Enum.Font.GothamMedium
    bindBtn.AutoButtonColor = false
    bindBtn.Parent = frame
    makeCorner(bindBtn, 4)

    local keybindObj = { Key = key }

    bindBtn.MouseButton1Click:Connect(function()
        listening = true
        bindBtn.Text = "..."
        bindBtn.TextColor3 = COLORS.accent
    end)

    self:_track(UserInputService.InputBegan:Connect(function(input, processed)
        if self.library.destroyed then return end

        if listening then
            if input.UserInputType ~= Enum.UserInputType.Keyboard then return end
            -- Escape clears the bind entirely so it's no longer bound to anything.
            if input.KeyCode == Enum.KeyCode.Escape then
                key = Enum.KeyCode.Unknown
                keybindObj.Key = key
                listening = false
                bindBtn.Text = "None"
                bindBtn.TextColor3 = COLORS.textDim
                changed(key)
                return
            end
            -- Reject modifier keys that would conflict with normal controls.
            if BLOCKED_KEYS[input.KeyCode] then return end
            key = input.KeyCode
            keybindObj.Key = key
            bindBtn.Text = key.Name
            bindBtn.TextColor3 = COLORS.textDim
            listening = false
            changed(key)
            return
        end

        if processed then return end
        if input.KeyCode == key and key ~= Enum.KeyCode.Unknown then
            callback(key)
        end
    end))

    -- Set(newKey, silent?): updates the bind; silent=true skips the Changed callback.
    keybindObj.Set = function(_, newKey, silent)
        if typeof(newKey) == "EnumItem" then
            key = newKey
        end
        keybindObj.Key = key
        bindBtn.Text = (key == Enum.KeyCode.Unknown) and "None" or key.Name
        if not silent then changed(key) end
    end

    self:_attachTooltip(frame, config.Tooltip)
    return self:_register(keybindObj, frame)
end

-- Text box (free text / number entry)
function TabClass:AddTextBox(config)
    config = config or {}
    local name = config.Name or "Input"
    local default = config.Default or ""
    local placeholder = config.Placeholder or "..."
    local numeric = config.Numeric or false
    local clearOnFocus = config.ClearOnFocus == nil and true or config.ClearOnFocus
    local callback = config.Callback or function() end

    self.layoutOrder = self.layoutOrder + 1

    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, 0, 0, 36)
    frame.BackgroundColor3 = COLORS.sectionBg
    frame.BorderSizePixel = 0
    frame.LayoutOrder = self.layoutOrder
    frame.Parent = self.page
    makeCorner(frame, 6)

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(0.5, -12, 1, 0)
    label.Position = UDim2.new(0, 12, 0, 0)
    label.BackgroundTransparency = 1
    label.Text = name
    label.TextColor3 = COLORS.text
    label.TextSize = 13
    label.Font = Enum.Font.GothamMedium
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Parent = frame

    local box = Instance.new("TextBox")
    box.Size = UDim2.new(0.5, -12, 0, 24)
    box.Position = UDim2.new(0.5, 0, 0.5, -12)
    box.BackgroundColor3 = COLORS.sliderBg
    box.BorderSizePixel = 0
    box.Text = tostring(default)
    box.PlaceholderText = placeholder
    box.PlaceholderColor3 = COLORS.textDim
    box.TextColor3 = COLORS.text
    box.TextSize = 12
    box.Font = Enum.Font.Gotham
    box.ClearTextOnFocus = clearOnFocus
    box.Parent = frame
    makeCorner(box, 4)

    local pad = Instance.new("UIPadding")
    pad.PaddingLeft = UDim.new(0, 8)
    pad.PaddingRight = UDim.new(0, 8)
    pad.Parent = box

    local textObj = { Value = tostring(default) }

    box.FocusLost:Connect(function(enterPressed)
        local text = box.Text
        if numeric then
            local n = tonumber(text)
            if not n then
                box.Text = textObj.Value   -- reject non-numeric, revert
                return
            end
            textObj.Value = n
            box.Text = tostring(n)
            callback(n, enterPressed)
        else
            textObj.Value = text
            callback(text, enterPressed)
        end
    end)

    textObj.Set = function(_, val, silent)
        textObj.Value = val
        box.Text = tostring(val)
        if not silent then callback(val, false) end
    end

    self:_attachTooltip(frame, config.Tooltip)
    return self:_register(textObj, frame)
end

-- Color picker (compact R/G/B sliders that expand like a dropdown)
function TabClass:AddColorPicker(config)
    config = config or {}
    local name = config.Name or "Color"
    local default = config.Default or Color3.fromRGB(255, 255, 255)
    local callback = config.Callback or function() end

    self.layoutOrder = self.layoutOrder + 1

    local r = math.floor(default.R * 255 + 0.5)
    local g = math.floor(default.G * 255 + 0.5)
    local b = math.floor(default.B * 255 + 0.5)
    local opened = false

    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, 0, 0, 36)
    frame.BackgroundColor3 = COLORS.sectionBg
    frame.BorderSizePixel = 0
    frame.LayoutOrder = self.layoutOrder
    frame.ClipsDescendants = true
    frame.Parent = self.page
    makeCorner(frame, 6)

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, -60, 0, 36)
    label.Position = UDim2.new(0, 12, 0, 0)
    label.BackgroundTransparency = 1
    label.Text = name
    label.TextColor3 = COLORS.text
    label.TextSize = 13
    label.Font = Enum.Font.GothamMedium
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Parent = frame

    local swatch = Instance.new("TextButton")
    swatch.Size = UDim2.new(0, 28, 0, 20)
    swatch.Position = UDim2.new(1, -40, 0.5, -10)
    swatch.BackgroundColor3 = default
    swatch.BorderSizePixel = 0
    swatch.Text = ""
    swatch.AutoButtonColor = false
    swatch.Parent = frame
    makeCorner(swatch, 4)
    makeStroke(swatch, COLORS.border, 1)

    local pickerObj = { Value = default }

    local function currentColor()
        return Color3.fromRGB(r, g, b)
    end
    local function refreshSwatch()
        local c = currentColor()
        swatch.BackgroundColor3 = c
        pickerObj.Value = c
    end

    -- Build a single 0-255 channel slider row at a given y offset.
    local channelRows = {}
    local function makeChannel(chName, getVal, setVal, yOff, barColor)
        local row = Instance.new("Frame")
        row.Size = UDim2.new(1, -24, 0, 18)
        row.Position = UDim2.new(0, 12, 0, yOff)
        row.BackgroundTransparency = 1
        row.Parent = frame

        local tag = Instance.new("TextLabel")
        tag.Size = UDim2.new(0, 14, 1, 0)
        tag.BackgroundTransparency = 1
        tag.Text = chName
        tag.TextColor3 = barColor
        tag.TextSize = 12
        tag.Font = Enum.Font.GothamBold
        tag.Parent = row

        local trackBg = Instance.new("Frame")
        trackBg.Size = UDim2.new(1, -52, 0, 6)
        trackBg.Position = UDim2.new(0, 20, 0.5, -3)
        trackBg.BackgroundColor3 = COLORS.sliderBg
        trackBg.BorderSizePixel = 0
        trackBg.Parent = row
        makeCorner(trackBg, 3)

        local fill = Instance.new("Frame")
        fill.Size = UDim2.new(getVal() / 255, 0, 1, 0)
        fill.BackgroundColor3 = barColor
        fill.BorderSizePixel = 0
        fill.Parent = trackBg
        makeCorner(fill, 3)

        local valTag = Instance.new("TextLabel")
        valTag.Size = UDim2.new(0, 28, 1, 0)
        valTag.Position = UDim2.new(1, -28, 0, 0)
        valTag.BackgroundTransparency = 1
        valTag.Text = tostring(getVal())
        valTag.TextColor3 = COLORS.textDim
        valTag.TextSize = 11
        valTag.Font = Enum.Font.Gotham
        valTag.TextXAlignment = Enum.TextXAlignment.Right
        valTag.Parent = row

        local sliding = false
        local function set(inputX)
            local rel = math.clamp((inputX - trackBg.AbsolutePosition.X) / trackBg.AbsoluteSize.X, 0, 1)
            local v = math.floor(rel * 255 + 0.5)
            setVal(v)
            fill.Size = UDim2.new(v / 255, 0, 1, 0)
            valTag.Text = tostring(v)
            refreshSwatch()
            callback(currentColor())
        end

        trackBg.InputBegan:Connect(function(input)
            if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
                sliding = true
                set(input.Position.X)
            end
        end)
        self:_track(UserInputService.InputEnded:Connect(function(input)
            if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
                sliding = false
            end
        end))
        self:_track(UserInputService.InputChanged:Connect(function(input)
            if sliding and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
                set(input.Position.X)
            end
        end))

        channelRows[chName] = {fill = fill, valTag = valTag, getVal = getVal}
    end

    makeChannel("R", function() return r end, function(v) r = v end, 40, Color3.fromRGB(255, 80, 80))
    makeChannel("G", function() return g end, function(v) g = v end, 62, Color3.fromRGB(80, 220, 80))
    makeChannel("B", function() return b end, function(v) b = v end, 84, Color3.fromRGB(80, 140, 255))

    swatch.MouseButton1Click:Connect(function()
        opened = not opened
        tween(frame, 0.25, {Size = UDim2.new(1, 0, 0, opened and 108 or 36)})
    end)

    pickerObj.Set = function(_, color, silent)
        r = math.floor(color.R * 255 + 0.5)
        g = math.floor(color.G * 255 + 0.5)
        b = math.floor(color.B * 255 + 0.5)
        for _, ch in pairs(channelRows) do
            ch.fill.Size = UDim2.new(ch.getVal() / 255, 0, 1, 0)
            ch.valTag.Text = tostring(ch.getVal())
        end
        refreshSwatch()
        if not silent then callback(currentColor()) end
    end

    self:_attachTooltip(frame, config.Tooltip)
    return self:_register(pickerObj, frame)
end

-- Button
function TabClass:AddButton(config)
    config = config or {}
    local name = config.Name or "Button"
    local callback = config.Callback or function() end

    self.layoutOrder = self.layoutOrder + 1

    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(1, 0, 0, 36)
    btn.BackgroundColor3 = COLORS.sectionBg
    btn.BorderSizePixel = 0
    btn.Text = name
    btn.TextColor3 = COLORS.text
    btn.TextSize = 13
    btn.Font = Enum.Font.GothamMedium
    btn.AutoButtonColor = false
    btn.LayoutOrder = self.layoutOrder
    btn.Parent = self.page
    makeCorner(btn, 6)

    btn.MouseEnter:Connect(function()
        tween(btn, 0.15, {BackgroundColor3 = COLORS.tabHover})
    end)
    btn.MouseLeave:Connect(function()
        tween(btn, 0.15, {BackgroundColor3 = COLORS.sectionBg})
    end)
    btn.MouseButton1Click:Connect(function()
        tween(btn, 0.1, {BackgroundColor3 = COLORS.accent})
        task.delay(0.15, function()
            tween(btn, 0.15, {BackgroundColor3 = COLORS.sectionBg})
        end)
        callback()
    end)

    local buttonObj = {}
    self:_attachTooltip(btn, config.Tooltip)
    return self:_register(buttonObj, btn)
end

-- Label (read-only text display)
function TabClass:AddLabel(text)
    self.layoutOrder = self.layoutOrder + 1

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 0, 24)
    label.BackgroundTransparency = 1
    label.Text = text or ""
    label.TextColor3 = COLORS.textDim
    label.TextSize = 12
    label.Font = Enum.Font.Gotham
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.TextWrapped = true
    label.AutomaticSize = Enum.AutomaticSize.Y
    label.LayoutOrder = self.layoutOrder
    label.Parent = self.page

    local pad = Instance.new("UIPadding")
    pad.PaddingLeft = UDim.new(0, 4)
    pad.Parent = label

    -- Return an object so labels behave like other elements (SetText, SetVisible).
    local labelObj = {
        SetText = function(_, newText) label.Text = newText or "" end,
    }
    -- Keep backward-compatible direct .Text access via metatable proxy.
    setmetatable(labelObj, {
        __index = function(_, k) if k == "Text" then return label.Text end end,
        __newindex = function(_, k, v) if k == "Text" then label.Text = v else rawset(labelObj, k, v) end end,
    })
    return self:_register(labelObj, label)
end

-- ═══════════════════════════════════════
-- RETURN LIBRARY
-- ═══════════════════════════════════════
return Library

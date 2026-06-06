# IDEF0Editor.vue Specification (REASONS Format)

## R — Requirements

### Problem Statement
Build an interactive IDEF0 (Integration Definition for Function Modeling) diagram editor as a Vue.js component that allows users to create, edit, and navigate hierarchical function models with blocks and ICOM (Input, Control, Output, Mechanism) arrows.

### Acceptance Criteria (AC)

1. **Canvas Rendering**
   - Component renders a `<canvas>` element with pan, zoom, and grid functionality
   - Blocks are displayed as rectangles with auto-wrapping text
   - Arrows are rendered with proper ICOM type color coding and direction indicators
   - Selection states show dashed borders/highlights for selected elements

2. **Block Operations**
   - Users can add new blocks via toolbar button
   - Users can drag blocks to reposition them
   - Users can delete selected blocks (Delete/Backspace key)
   - Users can edit block text via inline editor on double-click
   - Blocks auto-generate 4 default arrows (input, control, output, mechanism)

3. **Arrow Operations**
   - Arrows support 4 types: input, control, output, mechanism
   - Arrows connect blocks to blocks, blocks to boundary, or boundary to boundary
   - Users can drag arrow endpoints to reconnect to different blocks/boundaries
   - Users can detach arrow endpoints with Shift+click
   - Users can edit arrow labels via inline editor on double-click
   - ICOM markers (I/O/C/M) display at boundary connection points

4. **Navigation & Decomposition**
   - Users can enter nested diagrams by double-clicking a block with diagramId
   - Users can create nested diagrams via toolbar button on selected block
   - Users can navigate back to parent diagram
   - Breadcrumb navigation shows hierarchy path with clickable nodes
   - Diagram ID is preserved in URL query parameters

5. **Persistence**
   - Project data loads from IndexedDB on mount
   - Changes auto-save to IndexedDB
   - External changes trigger reload via onExternalChange listener

6. **Export**
   - Users can export diagram to PNG
   - Users can export diagram to SVG
   - Users can export diagram to JSON

7. **Validation**
   - Diagram validation runs on load and displays errors in status bar

## E — Entities

### Domain Model

```
Diagram
├── id: string (e.g., "A0", "A1", "A1.1")
├── name: string
├── parentDiagramId: string | null
├── parentBlockId: string | null
├── blocks: Block[]
├── arrows: Arrow[]
└── view: { x: number, y: number, scale: number }

Block
├── id: string
├── name: string
├── x, y, w, h: number (position and dimensions)
└── diagramId: string | null (reference to nested diagram)

Arrow
├── id: string
├── name: string (label)
├── type: 'input' | 'output' | 'control' | 'mechanism' | 'call'
├── from: { blockId: string | null, edge: string | null, offset: number, x?: number, y?: number }
├── to: { blockId: string | null, edge: string | null, offset: number, x?: number, y?: number }
├── segments: Point[] (intermediate path points)
└── labelX, labelY, labelAngle?: number (optional label positioning)
```

### Relationships
- Diagram **contains** multiple Blocks and Arrows
- Block **can have** one nested Diagram (via diagramId)
- Arrow **connects** two endpoints (block edge or boundary)
- Diagram **has parent** Diagram (via parentDiagramId)

## A — Approach

### Strategy

1. **Canvas-Based Rendering**: Use HTML5 Canvas for performant rendering of diagrams with zoom/pan support
2. **World-to-Screen Coordinate System**: Maintain separate logical (world) and pixel (screen) coordinate spaces with scale/offset transforms
3. **Event-Driven Interaction**: Handle mouse events for drag, pan, select, and edit operations
4. **Reactive State Management**: Use Vue's reactivity for UI synchronization with data model
5. **Modular Architecture**: Separate concerns into constants, db, validation, exporter, router, and hierarchy modules

### Key Design Decisions
- Grid system uses configurable gridSize from constants
- Arrow paths are calculated with orthogonal routing (horizontal/vertical segments)
- Boundary markers use fixed distance from diagram center area
- Inline editor uses absolute positioning over canvas with world-to-screen transformation
- URL sync uses query parameters for diagram navigation state

## S — Structure

### Component Hierarchy
```
IDEF0Editor.vue
├── Template
│   ├── Canvas (interactive drawing surface)
│   ├── Inline Editor (absolute positioned input)
│   ├── Toolbar (add block, navigation, export buttons)
│   └── Status Bar (error display)
├── Script
│   ├── Props/Data/Computed
│   ├── Lifecycle (mounted)
│   └── Methods
│       ├── Rendering (render, drawGrid, drawBlocks, drawArrows)
│       ├── Operations (addBlock, deleteSelectedBlock, createArrow)
│       ├── Navigation (enterBlock, goBack, navigateToDiagram)
│       ├── Interaction (mouse events, hit testing)
│       ├── Editing (startEdit, finishEdit, cancelEdit)
│       └── Export (exportPNG, exportSVG, exportJSON)
└── Styles
    ├── Scoped CSS for layout and positioning
    └── Toolbar, breadcrumb, status bar, inline editor styling
```

### Dependencies
- `./IDEF0Editor/constants` - COLORS, SIZES, DEFAULT_DIAGRAM
- `./IDEF0Editor/db` - loadProject, saveProject, onExternalChange
- `./IDEF0Editor/validation` - validateDiagram
- `./IDEF0Editor/exporter` - exportToPNG, exportToSVG, exportToJSON
- `./IDEF0Editor/router` - getDiagramIdFromQuery, setDiagramIdInQuery
- `./IDEF0Editor/hierarchy` - generateChildDiagramId, getParentDiagramId

## O — Operations

### Implementation Steps

1. **Initialization**
   - Mount canvas and get 2D context
   - Handle device pixel ratio for high-DPI displays
   - Load project data from IndexedDB or initialize default diagram
   - Sync diagram ID from URL query parameters
   - Register global keyboard and resize event listeners

2. **Rendering Pipeline**
   - Clear canvas with device pixel ratio transform
   - Apply world-to-screen transform (translate + scale)
   - Draw background grid
   - Draw arrows (path + arrowhead + label + boundary markers)
   - Draw blocks (fill + stroke + text with auto-wrapping)
   - Draw selection states (dashed borders, handles)
   - Restore context transform

3. **Block Management**
   - Add block at canvas center with default dimensions
   - Auto-create 4 ICOM arrows connected to block edges
   - Drag block by updating world coordinates
   - Delete block and all connected arrows
   - Edit block name via inline editor

4. **Arrow Management**
   - Calculate arrow path from endpoints using orthogonal routing
   - Reconnect arrow endpoint to block edge on drag release
   - Detach arrow endpoint to floating coordinates with Shift+click
   - Draw ICOM marker at boundary connection points
   - Edit arrow label via inline editor at midpoint

5. **Navigation**
   - Enter block: create or load nested diagram, update currentDiagramId
   - Go back: navigate to parent diagram via getParentDiagramId
   - Breadcrumb click: navigate to any diagram in hierarchy path
   - Update URL query with diagram ID on navigation

6. **Export**
   - PNG: export canvas as PNG image file
   - SVG: regenerate vector SVG from diagram data
   - JSON: export full project diagrams as JSON file

## N — Norms

### Engineering Standards

1. **Naming Conventions**
   - Vue component methods: camelCase
   - Event handlers: on<EventType> (onMouseDown, onDoubleClick)
   - Internal helpers: verbNoun (getArrowPoints, wrapText, truncateText)
   - Data properties: descriptive snakeCase or camelCase

2. **Defensive Coding**
   - Null checks before accessing nested properties (optional chaining)
   - Validate diagram state before operations
   - Guard against division by zero in coordinate transforms
   - Handle missing diagrams gracefully (return null from computed)

3. **Performance**
   - Use requestAnimationFrame for smooth rendering (if needed)
   - Minimize re-renders with selective updates
   - Cache expensive calculations (arrow points, diagram bounds)
   - Use Vue's $set/$delete for reactive array modifications

4. **Accessibility**
   - Keyboard support for Delete/Backspace, Space (pan), Escape (cancel edit)
   - Keyboard navigation for toolbar buttons
   - Clear visual feedback for selection states
   - Error messages in status bar

5. **Code Organization**
   - Group methods by concern (rendering, operations, navigation, etc.)
   - Keep template bindings minimal (use computed properties)
   - Extract constants to separate module
   - Separate file I/O from UI logic

## S — Safeguards

### Non-Negotiable Boundaries

1. **Data Integrity**
   - Never mutate diagrams object directly (use $set/$delete)
   - Always save after modifications (saveDiagram called after changes)
   - Preserve diagram IDs across operations (no ID regeneration on save)

2. **Coordinate Safety**
   - Clamp zoom scale between 0.2 and 5.0
   - Ensure block dimensions stay positive (w > 0, h > 0)
   - Validate arrow endpoints before rendering

3. **Memory Limits**
   - Limit nested diagram depth to prevent stack overflow (implement max depth check)
   - Clean up deleted diagrams from diagrams object
   - Remove orphaned arrows when blocks are deleted

4. **UI Responsiveness**
   - Canvas must resize properly on window resize
   - Inline editor must stay within canvas bounds
   - Breadcrumb must handle long hierarchy paths (overflow handling)

5. **Browser Compatibility**
   - Use Canvas API features supported in target browsers
   - Handle touch events if mobile support needed (not implemented yet)
   - Graceful degradation if IndexedDB unavailable

6. **Error Handling**
   - Catch and display validation errors in status bar
   - Handle export failures gracefully (show error, don't crash)
   - Log errors for debugging (implement error logging)

## User Stories

### US-1: Create and Arrange Blocks
**As a** systems analyst  
**I want to** add rectangular blocks to my IDEF0 diagram  
**So that** I can represent functions in my model

**Acceptance Criteria:**
- Click "+ Блок" button adds block at canvas center
- Drag block to reposition
- Double-click block to edit name
- Delete key removes selected block

### US-2: Connect Functions with ICOM Arrows
**As a** systems analyst  
**I want to** draw arrows between blocks with ICOM types  
**So that** I can show data and control flows

**Acceptance Criteria:**
- Auto-created arrows connect to block edges
- Drag arrow endpoint to reconnect to another block
- Shift+click detaches endpoint to floating position
- Arrow label edits on double-click
- ICOM markers (I/O/C/M) show at boundaries

### US-3: Navigate Hierarchical Diagrams
**As a** systems analyst  
**I want to** drill down into nested diagrams  
**So that** I can decompose complex functions

**Acceptance Criteria:**
- Double-click block with diagram enters nested diagram
- Click "+ Вложить" creates new nested diagram
- Click "← Назад" returns to parent
- Breadcrumb shows path with clickable nodes
- URL updates with diagram ID

### US-4: Pan, Zoom, and Explore
**As a** systems analyst  
**I want to** pan and zoom the canvas  
**So that** I can focus on specific areas

**Acceptance Criteria:**
- Mouse wheel zooms in/out at cursor position
- Space+drag or middle-click pans canvas
- Zoom level displays in toolbar (e.g., "100%")
- Grid scales with zoom

### US-5: Export Diagram for Sharing
**As a** systems analyst  
**I want to** export diagrams as PNG, SVG, or JSON  
**So that** I can share or backup my work

**Acceptance Criteria:**
- Click "PNG" downloads PNG image
- Click "SVG" downloads vector SVG
- Click "JSON" downloads project data
- File names include diagram name

### US-6: Recover from Errors
**As a** systems analyst  
**I want to** see validation errors  
**So that** I can fix diagram issues

**Acceptance Criteria:**
- Errors display in red status bar at bottom
- Error list shows all validation issues
- Errors update when diagram changes

## UX Guidelines

### Visual Feedback
- **Selection**: Dashed border (5px dash, 3px gap) in selection color
- **Hover**: Cursor changes to 'move' over draggable elements
- **Active**: Toolbar buttons show active state on click
- **Error**: Red background with white text in status bar

### Interaction Patterns
- **Consistent**: All editing uses inline editor on double-click
- **Predictable**: Delete always removes selected element
- **Discoverable**: Toolbar buttons have tooltips
- **Efficient**: Keyboard shortcuts for common actions

### Layout
- **Toolbar**: Top-left, semi-transparent white background
- **Breadcrumb**: Integrated in toolbar, clickable hierarchy
- **Status Bar**: Bottom-left, shows errors only when present
- **Inline Editor**: Absolute positioned over canvas element

### Responsive Behavior
- Canvas resizes to container on window resize
- Toolbar remains fixed position
- Breadcrumb wraps or truncates on narrow screens
- Inline editor stays within canvas bounds

## Non-Functional Requirements

### Performance
- Render 100+ blocks and arrows at 60 FPS
- Smooth pan/zoom with no visual artifacts
- Instant save (< 100ms for typical diagram)

### Scalability
- Support diagrams with 50+ blocks
- Support 5+ levels of nesting
- Handle 100+ arrows per diagram

### Maintainability
- Clear separation of concerns in code structure
- Documented constants and configuration
- Testable utility functions (arrow path, text wrapping)

### Security
- No user input directly rendered without sanitization
- No external data loaded without validation
- No sensitive data stored in client storage

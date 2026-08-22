// Twin of src/core/routineExport.ts — hand-maintained, not generated.
// src/core/routineExport.ts is the source of truth: change it there first, then mirror the
// change here. tests/twinParity.test.js fails if the two drift.
//
// Turns a GridLayout into a flat list of canvas draw ops + dimensions. Pure /
// renderer-agnostic: routineTab.js walks the ops against a 2D context and calls
// toDataURL. Keeping the geometry here makes it unit-testable without a DOM.

const DEFAULT_THEME = {
    bg: '#0b0f0d',
    headerText: '#cfd8d3',
    timeText: '#8a948f',
    gridLine: 'rgba(255,255,255,0.06)',
    hourLine: 'rgba(255,255,255,0.12)',
    blockText: '#ffffff',
    titleText: '#2ecc71',
};

export function defaultHueForSection(sectionId) {
    const raw = (sectionId * 47) % 360;
    return Math.round((raw + 30) % 360);
}

function dayLabel(day) {
    return ({
        SATURDAY: 'Sat', SUNDAY: 'Sun', MONDAY: 'Mon', TUESDAY: 'Tue',
        WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri',
    })[day] ?? day.slice(0, 3);
}

function hhmm(totalMin) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const hh = ((h + 11) % 12) + 1;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function buildExportPlan(layout, options = {}) {
    const timeColWidth = options.timeColWidth ?? 64;
    const dayColWidth = options.dayColWidth ?? 150;
    const rowHeight = options.rowHeight ?? 22;
    const headerHeight = options.headerHeight ?? 34;
    const titleHeight = options.title ? (options.titleHeight ?? 36) : 0;
    const padding = options.padding ?? 16;
    const theme = { ...DEFAULT_THEME, ...(options.theme ?? {}) };
    const hueFor = options.hueForSection ?? defaultHueForSection;

    const cols = layout.days.length;
    const gridWidth = timeColWidth + cols * dayColWidth;
    const gridHeight = headerHeight + layout.totalRows * rowHeight;

    const width = padding * 2 + gridWidth;
    const height = padding * 2 + titleHeight + gridHeight;

    const ops = [];
    const originX = padding;
    const originY = padding + titleHeight;

    ops.push({ type: 'rect', x: 0, y: 0, w: width, h: height, fill: theme.bg });

    if (options.title) {
        ops.push({
            type: 'text', x: padding, y: padding + 22,
            text: options.title, font: '700 18px sans-serif',
            fill: theme.titleText, align: 'left',
        });
    }

    layout.days.forEach((day, i) => {
        const x = originX + timeColWidth + i * dayColWidth + dayColWidth / 2;
        ops.push({
            type: 'text', x, y: originY + headerHeight - 12,
            text: dayLabel(day), font: '700 13px sans-serif',
            fill: theme.headerText, align: 'center',
        });
    });

    for (let r = 0; r <= layout.totalRows; r++) {
        const y = originY + headerHeight + r * rowHeight;
        const min = layout.startMin + r * layout.rowMinutes;
        const isHour = min % 60 === 0;
        ops.push({
            type: 'line', x1: originX, y1: y, x2: originX + gridWidth, y2: y,
            stroke: isHour ? theme.hourLine : theme.gridLine,
        });
        if (isHour && r < layout.totalRows) {
            ops.push({
                type: 'text', x: originX + timeColWidth - 8, y: y + 14,
                text: hhmm(min), font: '500 10px sans-serif',
                fill: theme.timeText, align: 'right',
            });
        }
    }

    for (let c = 0; c <= cols; c++) {
        const x = originX + timeColWidth + c * dayColWidth;
        ops.push({
            type: 'line', x1: x, y1: originY + headerHeight, x2: x, y2: originY + gridHeight,
            stroke: theme.gridLine,
        });
    }

    for (const block of layout.blocks) {
        const x = originX + timeColWidth + block.dayCol * dayColWidth + 2;
        const y = originY + headerHeight + (block.gridRowStart - 1) * rowHeight + 1;
        const w = dayColWidth - 4;
        const h = block.gridRowSpan * rowHeight - 2;
        const hue = hueFor(block.sectionId);
        ops.push({
            type: 'rect', x, y, w, h, radius: 5,
            fill: `hsl(${hue}, 60%, 24%)`,
            stroke: `hsl(${hue}, 70%, 50%)`,
        });
        // Text starts 7px in and must not run past the block's right edge — a
        // long room name would otherwise spill over the next day's column.
        const textMaxWidth = Math.max(1, w - 14);
        ops.push({
            type: 'text', x: x + 7, y: y + 15,
            // Code and room as one string, mirroring the on-screen
            // "CSE260 \u2022 10B-13C". One op rather than two positioned ops: a draw
            // plan cannot measure text, so placing the room after the code would
            // mean guessing the code's width.
            text: block.roomName ? `${block.courseCode} \u2022 ${block.roomName}` : block.courseCode,
            font: '700 12px sans-serif',
            fill: theme.blockText, align: 'left', maxWidth: textMaxWidth,
        });
        if (h >= 32) {
            const fac = block.facultyInitials || 'TBA';
            ops.push({
                type: 'text', x: x + 7, y: y + 29,
                text: `${fac} · Section ${block.sectionName}`, font: '400 10px sans-serif',
                fill: theme.blockText, align: 'left', maxWidth: textMaxWidth,
            });
        }
        if (h >= 46) {
            ops.push({
                type: 'text', x: x + 7, y: y + 42,
                text: `${hhmm(block.startMin)}–${hhmm(block.endMin)}`, font: '400 9px sans-serif',
                fill: theme.blockText, align: 'left', maxWidth: textMaxWidth,
            });
        }
    }

    return { width, height, ops };
}

export function exportFileName(now = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `shohoj-routine-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.png`;
}

// Browser-only: execute a draw plan against a 2D context.
export function paintExportPlan(ctx, plan) {
    for (const op of plan.ops) {
        if (op.type === 'rect') {
            if (op.fill) { ctx.fillStyle = op.fill; }
            if (op.radius && typeof ctx.roundRect === 'function') {
                ctx.beginPath();
                ctx.roundRect(op.x, op.y, op.w, op.h, op.radius);
                if (op.fill) ctx.fill();
                if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.stroke(); }
            } else {
                if (op.fill) ctx.fillRect(op.x, op.y, op.w, op.h);
                if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.strokeRect(op.x, op.y, op.w, op.h); }
            }
        } else if (op.type === 'line') {
            ctx.strokeStyle = op.stroke;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(op.x1, op.y1);
            ctx.lineTo(op.x2, op.y2);
            ctx.stroke();
        } else if (op.type === 'text') {
            ctx.font = op.font;
            ctx.fillStyle = op.fill;
            ctx.textAlign = op.align;
            if (typeof op.maxWidth === 'number') { ctx.fillText(op.text, op.x, op.y, op.maxWidth); }
            else { ctx.fillText(op.text, op.x, op.y); }
        }
    }
}

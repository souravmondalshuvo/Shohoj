export function drawTrendChart(canvas, data) {
  const dpr = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const green     = '#2ECC71';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  const labelColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
  const dotBg     = isDark ? '#060d09' : '#d4edde';

  const PAD = { top: 12, right: 16, bottom: 48, left: 36 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top  - PAD.bottom;

  const n = data.length;
  const gpas = data.map(d => d.gpa);
  const minG = Math.max(0, Math.min(...gpas) - 0.3);
  const maxG = Math.min(4, Math.max(...gpas) + 0.3);
  const range = maxG - minG || 1;

  const xOf = i => PAD.left + (i / (n - 1)) * cW;
  const yOf = g => PAD.top + cH - ((g - minG) / range) * cH;

  ctx.font = '10px DM Sans, sans-serif';
  ctx.fillStyle = labelColor;
  ctx.textAlign = 'right';
  [1, 2, 3, 4].forEach(g => {
    if (g < minG - 0.1 || g > maxG + 0.1) return;
    const y = yOf(g);
    ctx.beginPath();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(g.toFixed(1), PAD.left - 5, y + 3.5);
  });

  const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
  grad.addColorStop(0, 'rgba(46,204,113,0.22)');
  grad.addColorStop(1, 'rgba(46,204,113,0.00)');
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(data[0].gpa));
  data.forEach((d, i) => { if (i > 0) ctx.lineTo(xOf(i), yOf(d.gpa)); });
  ctx.lineTo(xOf(n - 1), H - PAD.bottom);
  ctx.lineTo(xOf(0), H - PAD.bottom);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = green;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap  = 'round';
  data.forEach((d, i) => {
    i === 0 ? ctx.moveTo(xOf(i), yOf(d.gpa)) : ctx.lineTo(xOf(i), yOf(d.gpa));
  });
  ctx.stroke();

  data.forEach((d, i) => {
    const x = xOf(i), y = yOf(d.gpa);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = dotBg;
    ctx.fill();
    ctx.strokeStyle = green;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 10px DM Sans, sans-serif';
    ctx.fillStyle = green;
    ctx.textAlign = 'center';
    ctx.fillText(d.gpa.toFixed(2), x, y - 9);

    ctx.save();
    ctx.translate(x, H - PAD.bottom + 8);
    if (n > 5) {
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'right';
      ctx.font = '9px DM Sans, sans-serif';
    } else {
      ctx.textAlign = 'center';
      ctx.font = '10px DM Sans, sans-serif';
    }
    ctx.fillStyle = labelColor;
    ctx.fillText(d.label, 0, 0);
    ctx.restore();
  });

  ctx.save();
  ctx.translate(10, PAD.top + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.font = '9px DM Sans, sans-serif';
  ctx.fillStyle = labelColor;
  ctx.fillText('GPA', 0, 0);
  ctx.restore();
}

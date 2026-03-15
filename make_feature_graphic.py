from PIL import Image

CANVAS_W = 1024
CANVAS_H = 500
LOGO_MAX_H = 340   # logo height on the canvas (generous but with padding)

# Load the logo
logo = Image.open("assets/splash-icon.png").convert("RGBA")

# Scale logo to fit within the canvas with padding
lw, lh = logo.size
scale = min(CANVAS_W * 0.7 / lw, LOGO_MAX_H / lh)
new_w = int(lw * scale)
new_h = int(lh * scale)
logo = logo.resize((new_w, new_h), Image.LANCZOS)

# Create white canvas
canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (255, 255, 255, 255))

# Paste logo centered
x = (CANVAS_W - new_w) // 2
y = (CANVAS_H - new_h) // 2
canvas.paste(logo, (x, y), logo)

# Save as PNG (convert to RGB first so it's compatible everywhere)
out = canvas.convert("RGB")
out.save("feature_graphic.png", "PNG", optimize=True)
print(f"Saved feature_graphic.png  ({CANVAS_W}x{CANVAS_H}px, logo={new_w}x{new_h})")

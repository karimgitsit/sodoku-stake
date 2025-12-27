#!/usr/bin/env python3
"""
Script to generate a zoomed-in version of the app icon for World Coin app store.
Zooms in by 7.5% (middle of 5-10% range) to remove edge borders.
"""

from PIL import Image, ImageDraw, ImageFont
import os

def generate_zoomed_logo():
    """Generate zoomed-in version of the app icon"""
    
    # Canvas size
    canvas_size = 512
    
    # Original grid-container size: 380px
    # Zoom factor: 7.5% (1.075x)
    zoom_factor = 1.075
    original_size = 380
    zoomed_size = int(original_size * zoom_factor)  # ~408px
    
    # Create white background
    img = Image.new('RGB', (canvas_size, canvas_size), color='#ffffff')
    draw = ImageDraw.Draw(img)
    
    # Calculate position to center the zoomed grid
    grid_x = (canvas_size - zoomed_size) // 2
    grid_y = (canvas_size - zoomed_size) // 2
    
    # Draw the grid container background (brown)
    border_radius = 32
    # Draw rounded rectangle for grid container
    draw.rounded_rectangle(
        [(grid_x, grid_y), (grid_x + zoomed_size, grid_y + zoomed_size)],
        radius=border_radius,
        fill='#3d3427',
        outline=None
    )
    
    # Draw shadow (simplified - just a darker rectangle offset)
    shadow_offset = 8
    shadow_y = grid_y + shadow_offset
    draw.rounded_rectangle(
        [(grid_x, shadow_y), (grid_x + zoomed_size, shadow_y + zoomed_size)],
        radius=border_radius,
        fill='#c9b896',
        outline=None
    )
    
    # Redraw the grid container on top of shadow
    draw.rounded_rectangle(
        [(grid_x, grid_y), (grid_x + zoomed_size, grid_y + zoomed_size)],
        radius=border_radius,
        fill='#3d3427',
        outline=None
    )
    
    # Draw the 3x3 grid of cells
    padding = 8
    cell_area_size = zoomed_size - (padding * 2)
    cell_size = (cell_area_size - (2 * 8)) // 3  # 3 cells with 2 gaps of 8px
    
    cell_radius = 8
    for row in range(3):
        for col in range(3):
            cell_x = grid_x + padding + col * (cell_size + 8)
            cell_y = grid_y + padding + row * (cell_size + 8)
            draw.rounded_rectangle(
                [(cell_x, cell_y), (cell_x + cell_size, cell_y + cell_size)],
                radius=cell_radius,
                fill='#fef6e4',
                outline=None
            )
    
    # Draw dollar sign
    try:
        # Try to use system font
        font_size = int(180 * zoom_factor)  # ~194px
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", font_size)
    except:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except:
            # Fallback to default font
            font = ImageFont.load_default()
    
    # Calculate text position (centered)
    text = "$"
    # Get text bounding box
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    text_x = grid_x + (zoomed_size - text_width) // 2
    text_y = grid_y + (zoomed_size - text_height) // 2 - bbox[1]
    
    # Draw text with outline (shadow effect)
    outline_color = '#3d3427'
    outline_width = 6
    for dx in [-outline_width, 0, outline_width]:
        for dy in [-outline_width, 0, outline_width]:
            if dx != 0 or dy != 0:
                draw.text((text_x + dx, text_y + dy), text, font=font, fill=outline_color)
    
    # Draw main text
    draw.text((text_x, text_y), text, font=font, fill='#4a9d5b')
    
    # Save the image
    output_path = "app/public/app-icon-zoomed.png"
    img.save(output_path, 'PNG')
    
    print(f"✅ Generated zoomed logo at: {output_path}")
    print(f"   Zoom factor: {zoom_factor * 100:.1f}%")
    print(f"   Grid size: {original_size}px → {zoomed_size}px")
    print(f"   Font size: 180px → {int(180 * zoom_factor)}px")
    print(f"\n📸 Image saved! You can view it at: {os.path.abspath(output_path)}")
    
    return output_path

if __name__ == "__main__":
    generate_zoomed_logo()

from PIL import Image, UnidentifiedImageError
import requests
from io import BytesIO
import sys

# Add a function to resize the image proportionally
def resize_image(collage, max_dimension):
    original_width, original_height = collage.size
    if original_width > max_dimension or original_height > max_dimension:
        if original_width > original_height:
            scale = max_dimension / original_width
        else:
            scale = max_dimension / original_height
        new_width = int(original_width * scale)
        new_height = int(original_height * scale)
        return collage.resize((new_width, new_height), Image.Resampling.LANCZOS)
    return collage

def read_image_urls_from_file(file_path):
    with open(file_path, 'r') as file:
        urls = file.readlines()
    return [url.strip() for url in urls]

DEFAULT_IMAGES_PER_ROW = 4

x = DEFAULT_IMAGES_PER_ROW
if len(sys.argv) > 1:
    try:
        x = int(sys.argv[1])
    except ValueError:
        print(f"Invalid input for the number of images per row. Using default value of {DEFAULT_IMAGES_PER_ROW}.")

image_urls = read_image_urls_from_file('images.txt')

images = []
downloaded_count = 0  # Initialize the counter for successfully downloaded images
total_images = len(image_urls)  # Total number of images

for url in image_urls:
    try:
        response = requests.get(url, timeout=10)  # Increase timeout to 10 seconds
        response = requests.get(url, timeout=10)  # Increase timeout to 10 seconds
        # Skip Content-Type check and attempt to open all files
        image = Image.open(BytesIO(response.content))
        images.append(image)
        downloaded_count += 1  # Increment the counter
        print(f"Downloaded and processed {downloaded_count}/{total_images} images.")
    except requests.exceptions.RequestException as e:
        print(f"Error downloading image from {url}: {e}")
    except UnidentifiedImageError as e:
        print(f"Cannot identify image file from {url}: {e}")

if images:  # Only proceed if there are any images
    max_height = max(image.height for image in images) * ((len(images) - 1) // x + 1)
    max_width = max(image.width for image in images) * x
    collage = Image.new('RGB', (max_width, max_height))

    x_offset = 0
    y_offset = 0
    count = 0

    for image in images:
        collage.paste(image, (x_offset, y_offset))
        x_offset += image.width
        count += 1
        if count == x:
            y_offset += image.height
            x_offset = 0
            count = 0

    # Before saving, resize the collage if necessary
    MAX_DIMENSION = 65500
    collage = resize_image(collage, MAX_DIMENSION)

    # Now save the resized collage
    collage.save('collage.jpg')
    collage.show()
else:
    print("No valid images to create a collage.")

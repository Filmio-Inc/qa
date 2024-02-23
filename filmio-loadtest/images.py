from PIL import Image
import requests
from io import BytesIO
import sys  # Import sys to read command line arguments

# Function to read URLs from a file
def read_image_urls_from_file(file_path):
    with open(file_path, 'r') as file:
        urls = file.readlines()
    return [url.strip() for url in urls]  # Remove any newline characters and spaces

# Set a default number of images per row
DEFAULT_IMAGES_PER_ROW = 4

# Read the number of images per row from command line arguments
x = DEFAULT_IMAGES_PER_ROW  # Use default value if none is provided
if len(sys.argv) > 1:
    try:
        x = int(sys.argv[1])  # Convert the argument to an integer
    except ValueError:
        print("Invalid input for the number of images per row. Using default value of {}.".format(DEFAULT_IMAGES_PER_ROW))

# Replace 'images.txt' with the path to your text file
image_urls = read_image_urls_from_file('images.txt')

# Download images and convert them to PIL Image objects
images = [Image.open(BytesIO(requests.get(url).content)) for url in image_urls]

# Determine the size of the collage based on x images per row
max_height = max(image.height for image in images) * ((len(images) - 1) // x + 1)
max_width = max(image.width for image in images) * x
collage = Image.new('RGB', (max_width, max_height))

# Paste images into the collage, x images per row
x_offset = 0
y_offset = 0
count = 0  # Counter for images per row

for image in images:
    collage.paste(image, (x_offset, y_offset))
    x_offset += image.width
    count += 1
    
    # Move to the next row after x images
    if count == x:
        y_offset += image.height
        x_offset = 0
        count = 0

# Save or display the collage
collage.save('collage.jpg')  # Save the collage to a file
collage.show()  # Display the collage in a viewer

#!/bin/bash
# R16 — تولید بنرهای سینمایی فروشگاه برای انواع کسب‌وکار
# تصاویر بدون متن — متن فارسی به‌صورت HTML overlay در قالب‌ها (صفر غلط املایی)
# خروجی: public/banners/<type>.png → بعداً به AVIF تبدیل می‌شود
set -u
OUT="/home/z/my-project/hooshhesab/public/banners"
mkdir -p "$OUT"

gen() { # gen <id> <prompt> — با retry و فاصلهٔ زمانی (محدودیت نرخ API)
  local id="$1"; shift
  local prompt="$1"
  if [ -s "$OUT/$id.png" ]; then echo "skip $id (exists)"; return 0; fi
  echo ">>> generating $id ..."
  local attempt=0 max=6
  while [ $attempt -lt $max ]; do
    attempt=$((attempt+1))
    z-ai image -p "$prompt" -o "$OUT/$id.png" -s 1344x768 >/dev/null 2>&1
    if [ -s "$OUT/$id.png" ]; then
      echo "OK $id ($(stat -c%s "$OUT/$id.png") bytes) [attempt $attempt]"
      sleep 20
      return 0
    fi
    echo "  retry $id in 30s (attempt $attempt/$max failed)"
    sleep 45
  done
  echo "FAILED $id after $max attempts"
}

# همهٔ بنرها: سینمایی، تیره برای متن سفید overlay، بدون هیچ متن/حروف در تصویر، بدون واترمارک
gen mobile "Cinematic wide shot of a modern smartphone store interior at night, glowing glass display shelves with premium phones and tablets, deep teal and charcoal ambiance, dramatic rim lighting, bokeh, photorealistic, moody dark background on left side for text overlay, professional commercial photography, no text, no letters, no watermark, high quality, detailed"

gen hardware "Cinematic wide shot inside an Iranian traditional hardware store (abzar-khaneh), shelves full of tools, wrenches, drills, power tools and metal parts hanging, warm amber industrial lighting, copper and dark bronze tones, dramatic shadows, photorealistic commercial photography, dark areas on right side, no text, no letters, no watermark, high quality, detailed"

gen tailor "Cinematic wide shot of an elegant tailor atelier, rolls of premium fabric, vintage sewing machines, mannequin with elegant suit, warm dramatic spotlight, rose and cream tones with deep shadows, luxury boutique atmosphere, photorealistic, no text, no letters, no watermark, high quality, detailed"

gen restaurant "Cinematic wide shot of a cozy Persian restaurant interior, traditional wooden tables set beautifully, saffron rice and kebab dishes with steam, warm golden lighting, pomegranate and amber tones, shallow depth of field, photorealistic food commercial photography, dark vignette corners, no text, no letters, no watermark, high quality, detailed"

gen grocery "Cinematic wide shot of a fresh modern grocery store aisle, colorful fresh fruits and vegetables, olive oil bottles, nuts and dried fruits in wooden crates, emerald green and warm amber lighting, glossy reflections, photorealistic commercial photography, no text, no letters, no watermark, high quality, detailed"

gen construction "Cinematic wide shot of a building materials warehouse, stacks of tiles, ceramic samples, bags of cement, paint buckets, industrial skylight beams, copper and steel tones with volumetric light rays, photorealistic, moody dark sides, no text, no letters, no watermark, high quality, detailed"

gen cosmetics "Cinematic wide shot of a luxury cosmetics and beauty store, elegant glass shelves with cream jars, perfume bottles, rose petals, soft rose-gold lighting on cream marble, dreamy bokeh, photorealistic premium commercial photography, no text, no letters, no watermark, high quality, detailed"

gen books "Cinematic wide shot of a warm bookstore stationery shop, wooden shelves full of colorful books, stacked notebooks, fountain pens on wooden desk, warm library lighting, amber and forest green tones, photorealistic, cozy atmosphere, no text on covers readable, no letters, no watermark, high quality, detailed"

gen photo "Cinematic wide shot of a professional photo studio and print shop, large format printer working, cameras on desk, studio softbox lights, printed photo frames glowing, dark charcoal environment with teal accent lights, photorealistic, no text, no letters, no watermark, high quality, detailed"

gen jewelry "Cinematic macro wide shot of luxury jewelry display, gold bracelets and necklaces on black velvet, diamond ring catching light, dramatic single spotlight, deep black background, gold sparkle bokeh, photorealistic high-end commercial photography, no text, no letters, no watermark, high quality, detailed"

gen autoparts "Cinematic wide shot of an auto parts store garage, organized shelves of car parts, brake discs, oil bottles, tires stacked, chrome details catching red and teal neon light accents, industrial moody atmosphere, photorealistic, dark left side, no text, no letters, no watermark, high quality, detailed"

gen electronics "Cinematic wide shot of a computer and electronics store, gaming laptops glowing, RGB mechanical keyboards, monitors displaying abstract color gradients, circuit board wall art, teal and amber neon accents on dark background, photorealistic tech commercial photography, no text, no letters, no watermark, high quality, detailed"

gen souvenir "Cinematic wide shot of a Persian handicrafts and souvenir shop, turquoise ceramic vases, hand-woven carpets, copper engraved trays, saffron packages, warm bazaar lighting with light rays through dust, terracotta and turquoise tones, photorealistic, no text, no letters, no watermark, high quality, detailed"

gen flowers "Cinematic wide shot of a beautiful flower shop, buckets of fresh roses, tulips and dried flowers, eucalyptus branches, morning light through window, blush pink and sage green tones, soft dreamy atmosphere, photorealistic commercial photography, no text, no letters, no watermark, high quality, detailed"

gen fashion "Cinematic wide shot of a modern fashion boutique clothing store, racks of stylish clothes, mannequins in elegant outfits, marble floor, pomegranate red and cream tones, premium retail lighting, photorealistic, dark right side for overlay, no text, no letters, no watermark, high quality, detailed"

gen general "Cinematic abstract wide banner for an online store, flowing silk fabric waves with subtle floating shopping bag shapes, emerald green gold and deep charcoal gradient, soft bokeh particles, luxurious premium feel, dark center-left area for text, photorealistic 3d render style, no text, no letters, no watermark, high quality, detailed"

gen nursery "Cinematic wide shot inside a plant nursery garden center, rows of young fruit tree saplings in black pots on wooden benches, seed packet displays, lush green foliage, soft morning sunlight rays through greenhouse glass, dew drops on leaves, deep emerald green and dark forest tones, photorealistic commercial photography, dark left side for text overlay, no text, no letters, no watermark, high quality, detailed"

gen appliances "Cinematic wide shot of a modern home appliance store showroom, stainless steel refrigerators and washing machines in a row, sleek kitchen appliances on display, warm orange accent lighting mixed with soft teal highlights, polished reflective floor, premium retail atmosphere, dark moody background on right side for text overlay, photorealistic commercial photography, no text, no letters, no watermark, high quality, detailed"

echo "=== DONE ==="
ls -la "$OUT"

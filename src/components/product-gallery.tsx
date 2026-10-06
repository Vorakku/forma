import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { Box } from "lucide-react";
import { ProductImage } from "./common";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

const Product3D = lazy(() =>
  import("./product-3d").then((module) => ({ default: module.Product3D })),
);
class ViewerBoundary extends Component<
  { children: ReactNode; onPhotos: () => void },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="product-3d-stage">
        <div className="product-3d-fallback" role="status">
          <p>The 3D view could not load. You can still explore the photos.</p>
          <button
            type="button"
            className="button small outline"
            onClick={this.props.onPhotos}
          >
            View photos
          </button>
        </div>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function ProductGallery({
  product,
  color,
  onZoom,
}: {
  product: Product;
  color: number;
  onZoom: () => void;
}) {
  const [image, setImage] = useState(0),
    [three, setThree] = useState(false),
    available = product.slug === "the-ellis";
  const photos = () => setThree(false);
  return (
    <div className="product-gallery">
      {available && (
        <div
          className="product-gallery-modes"
          role="group"
          aria-label="Product gallery mode"
        >
          <button type="button" aria-pressed={!three} onClick={photos}>
            Photos
          </button>
          <button
            type="button"
            aria-pressed={three}
            onClick={() => setThree(true)}
          >
            <Box aria-hidden="true" /> View in 3D
          </button>
        </div>
      )}
      {three && available ? (
        <ViewerBoundary onPhotos={photos}>
          <Suspense
            fallback={
              <div className="product-3d-stage">
                <div className="product-3d-fallback" role="status">
                  <p>Opening your 3D perspective…</p>
                </div>
              </div>
            }
          >
            <Product3D product={product} color={color} onPhotos={photos} />
          </Suspense>
        </ViewerBoundary>
      ) : (
        <>
          <button
            type="button"
            className="product-large"
            onClick={onZoom}
            aria-label="Enlarge product image"
          >
            <ProductImage
              product={product}
              color={color}
              className={image === 1 ? "detail-image" : undefined}
              width="384"
              height="342"
            />
          </button>
          <div className="thumb-row">
            <button
              type="button"
              className={cn("thumb", image === 0 && "active")}
              onClick={() => setImage(0)}
              aria-label="Full frame view"
              aria-pressed={image === 0}
            >
              <ProductImage product={product} color={color} />
            </button>
            <button
              type="button"
              className={cn("thumb detail", image === 1 && "active")}
              onClick={() => setImage(1)}
              aria-label="Frame detail close-up"
              aria-pressed={image === 1}
            >
              <ProductImage product={product} color={color} />
            </button>
          </div>
        </>
      )}
      <p className="form-note">
        Frame dimensions: {product.dimensions.replaceAll(" · ", " / ")} mm ·{" "}
        {product.weight}
      </p>
    </div>
  );
}

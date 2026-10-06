-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT,
    "guest" BOOLEAN NOT NULL DEFAULT true,
    "cartVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT 'FORMA',
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "originalPrice" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 10 CHECK ("stock" >= 0),
    "sold" INTEGER NOT NULL DEFAULT 0,
    "rating" REAL NOT NULL DEFAULT 4.7,
    "image" TEXT NOT NULL,
    "images" TEXT NOT NULL DEFAULT '[]',
    "sizes" TEXT NOT NULL,
    "colors" TEXT NOT NULL,
    "swatches" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "dimensions" TEXT NOT NULL,
    "weight" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 99,
    "tag" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "lens" TEXT NOT NULL,
    "coating" TEXT NOT NULL,
    "prescription" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL CHECK ("quantity" BETWEEN 1 AND 20),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "Wishlist" (
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    PRIMARY KEY ("userId", "productId"),
    CONSTRAINT "Wishlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Wishlist_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cartVersion" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL,
    "shipping" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "shippingMethod" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "coupon" TEXT NOT NULL DEFAULT '',
    "returnReason" TEXT NOT NULL DEFAULT '',
    "events" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "sample" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "likedBy" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewComment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "email" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "RestockRequest" (
    "productId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("productId", "email")
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL
);
--> statement-breakpoint

-- CreateTable
CREATE TABLE "OperationGuard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "valid" INTEGER NOT NULL CHECK ("valid" = 1)
);
--> statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
--> statement-breakpoint

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
--> statement-breakpoint

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");
--> statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_userId_productId_size_color_lens_coating_prescription_key" ON "CartItem"("userId", "productId", "size", "color", "lens", "coating", "prescription");
--> statement-breakpoint

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");
--> statement-breakpoint

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
--> statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key" ON "Order"("userId", "idempotencyKey");
--> statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_cartVersion_key" ON "Order"("userId", "cartVersion");
--> statement-breakpoint

-- CreateIndex
CREATE INDEX "Review_productId_createdAt_idx" ON "Review"("productId", "createdAt");
--> statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_productId_key" ON "Review"("userId", "productId");
--> statement-breakpoint

-- CreateIndex
CREATE INDEX "ReviewComment_reviewId_createdAt_idx" ON "ReviewComment"("reviewId", "createdAt");
--> statement-breakpoint

-- CreateIndex
CREATE INDEX "SupportRequest_userId_createdAt_idx" ON "SupportRequest"("userId", "createdAt");
--> statement-breakpoint

-- CreateIndex
CREATE INDEX "AuthChallenge_userId_type_idx" ON "AuthChallenge"("userId", "type");
--> statement-breakpoint


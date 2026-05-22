import React, { useState } from "react";
import { CartProvider } from "./hooks/useCart";
import Header from "./components/Header";
import Hero from "./components/Hero";
import ProductGrid from "./components/ProductGrid";
import Cart from "./components/Cart";
import Footer from "./components/Footer";
import "./index.css";

export default function App() {
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");

  return (
    <CartProvider>
      <div className="app">
        <Header onCartClick={() => setCartOpen(true)} />
        <main>
          <Hero />
          <ProductGrid
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
        </main>
        <Footer />
        <Cart isOpen={cartOpen} onClose={() => setCartOpen(false)} />
      </div>
    </CartProvider>
  );
}

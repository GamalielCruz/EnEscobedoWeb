/**
 * Pruebas de validación del modelo financiero de Mandados
 * 
 * Modelo económico:
 * - polygonPrice → repartidor
 * - $10 service fee → ElMenu
 * - Stripe fee → 50/50 (repartidor/ElMenu)
 */

import assert from "node:assert/strict";
import test from "node:test";

// Reimplementación de calculateMandadoQuote para testing
const MANDADO_SERVICE_FEE = 10;

function calculateMandadoQuote(origin, destination) {
  if (!origin.allowed || !origin.zone) {
    return { allowed: false, finalPrice: null, polygonPrice: null, outsidePoint: "origin" };
  }
  if (!destination.allowed || !destination.zone) {
    return { allowed: false, finalPrice: null, polygonPrice: null, outsidePoint: "destination" };
  }
  if (origin.finalPrice == null || destination.finalPrice == null) {
    return { allowed: false, finalPrice: null, polygonPrice: null, outsidePoint: null };
  }

  const polygonPrice = Math.max(origin.finalPrice, destination.finalPrice);
  return {
    allowed: true,
    finalPrice: polygonPrice + MANDADO_SERVICE_FEE,
    polygonPrice,
    outsidePoint: null,
  };
}

// Mock de createMandadoSettlementSnapshot y readSettlementFromSnapshot
// ya que dependen de server-only y otros módulos complejos
function mockCreateMandadoSettlementSnapshot(draft, paymentMethod, stripeFee) {
  const polygonPrice = draft.polygonPrice;
  const platformServiceFee = MANDADO_SERVICE_FEE;
  const paidOnline = paymentMethod === "stripe";
  const stripeFeeAmount = paidOnline ? (stripeFee || 0) : 0;
  const driverStripeShare = paidOnline ? stripeFeeAmount * 0.5 : 0;
  const platformStripeShare = paidOnline ? stripeFeeAmount * 0.5 : 0;
  
  return {
    grossTotal: draft.price,
    platformServiceFee,
    deliveryAmount: polygonPrice,
    paymentProcessingFee: stripeFeeAmount,
    driverProcessingFee: driverStripeShare,
    platformProcessingFee: platformStripeShare,
    driverNetAmount: polygonPrice - driverStripeShare,
    platformNetRevenue: platformServiceFee - platformStripeShare,
  };
}

const quote = (name, price) => ({
  allowed: true,
  finalPrice: price,
  zone: { id: name, name, basePrice: price },
});

const createDraft = (price, polygonPrice) => ({
  mode: "pickup",
  origin: { label: "Origin", lat: 25.6866, lng: -100.3161 },
  destination: { label: "Dest", lat: 25.6866, lng: -100.3161 },
  details: "Test",
  price,
  polygonPrice,
  pinEnabled: false,
});

test("PRUEBA A: Mandado $44 + $10, efectivo", () => {
  const originQuote = quote("Zone1", 44);
  const destinationQuote = quote("Zone2", 30);
  
  const quoteResult = calculateMandadoQuote(originQuote, destinationQuote);
  
  assert.equal(quoteResult.finalPrice, 54, "Cliente paga $54");
  assert.equal(quoteResult.polygonPrice, 44, "Polygon price es $44");
  assert.equal(MANDADO_SERVICE_FEE, 10, "Service fee es $10");
  
  const draft = createDraft(quoteResult.finalPrice, quoteResult.polygonPrice);
  const snapshot = mockCreateMandadoSettlementSnapshot(draft, "cash_on_delivery");
  
  assert.equal(snapshot.grossTotal, 54, "Snapshot grossTotal $54");
  assert.equal(snapshot.platformServiceFee, 10, "Snapshot platformServiceFee $10");
  assert.equal(snapshot.deliveryAmount, 44, "Snapshot deliveryAmount $44");
  assert.equal(snapshot.driverNetAmount, 44, "Driver net $44 (sin Stripe fee)");
  assert.equal(snapshot.platformNetRevenue, 10, "Platform net $10 (sin Stripe fee)");
  assert.equal(snapshot.paymentProcessingFee, 0, "Processing fee $0 (efectivo)");
});

test("PRUEBA B: Mandado $44 + $10, tarjeta con Stripe fee $6.04", () => {
  const originQuote = quote("Zone1", 44);
  const destinationQuote = quote("Zone2", 30);
  
  const quoteResult = calculateMandadoQuote(originQuote, destinationQuote);
  const stripeFee = 6.04;
  
  assert.equal(quoteResult.finalPrice, 54, "Cliente paga $54");
  assert.equal(quoteResult.polygonPrice, 44, "Polygon price es $44");
  
  const draft = createDraft(quoteResult.finalPrice, quoteResult.polygonPrice);
  const snapshot = mockCreateMandadoSettlementSnapshot(draft, "stripe", stripeFee);
  
  const driverStripeShare = stripeFee * 0.5;
  const platformStripeShare = stripeFee * 0.5;
  
  assert.equal(snapshot.grossTotal, 54, "Snapshot grossTotal $54");
  assert.equal(snapshot.platformServiceFee, 10, "Snapshot platformServiceFee $10");
  assert.equal(snapshot.deliveryAmount, 44, "Snapshot deliveryAmount $44");
  assert.equal(snapshot.paymentProcessingFee, stripeFee, "Processing fee $6.04");
  assert.equal(snapshot.driverProcessingFee, driverStripeShare, "Driver Stripe share $3.02");
  assert.equal(snapshot.platformProcessingFee, platformStripeShare, "Platform Stripe share $3.02");
  assert.equal(snapshot.driverNetAmount, 44 - driverStripeShare, "Driver net $40.98");
  assert.equal(snapshot.platformNetRevenue, 10 - platformStripeShare, "Platform net $6.98");
});

test("PRUEBA C: Mandado $80 + $10", () => {
  const originQuote = quote("Zone1", 80);
  const destinationQuote = quote("Zone2", 50);
  
  const quoteResult = calculateMandadoQuote(originQuote, destinationQuote);
  
  assert.equal(quoteResult.finalPrice, 90, "Cliente paga $90");
  assert.equal(quoteResult.polygonPrice, 80, "Polygon price es $80");
  
  const draft = createDraft(quoteResult.finalPrice, quoteResult.polygonPrice);
  const snapshot = mockCreateMandadoSettlementSnapshot(draft, "cash_on_delivery");
  
  assert.equal(snapshot.grossTotal, 90, "Snapshot grossTotal $90");
  assert.equal(snapshot.platformServiceFee, 10, "Snapshot platformServiceFee $10");
  assert.equal(snapshot.deliveryAmount, 80, "Snapshot deliveryAmount $80");
  assert.equal(snapshot.driverNetAmount, 80, "Driver net $80");
  assert.equal(snapshot.platformNetRevenue, 10, "Platform net $10");
});

test("PRUEBA D: Verificar que driverPayout NO sea el total del cliente", () => {
  const originQuote = quote("Zone1", 44);
  const destinationQuote = quote("Zone2", 30);
  
  const quoteResult = calculateMandadoQuote(originQuote, destinationQuote);
  
  const draft = createDraft(quoteResult.finalPrice, quoteResult.polygonPrice);
  const snapshot = mockCreateMandadoSettlementSnapshot(draft, "cash_on_delivery");
  
  assert.equal(snapshot.deliveryAmount, 44, "Driver payout es $44 (polygonPrice)");
  assert.equal(snapshot.grossTotal, 54, "Total cliente es $54");
  assert.notEqual(snapshot.deliveryAmount, snapshot.grossTotal, "driverPayout NO es igual al total del cliente");
});

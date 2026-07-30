import { type SchemaTypeDefinition } from 'sanity'

import {blockContentType} from './blockContentType'
import {categoryType} from './categoryType'
import { productType } from './productType'
import { option } from './option'
import { optionGroup } from './optionGroup'
import { productUpdateRequest } from './productUpdateRequest'
import { orderType } from './orderType';
import { salesType } from './salesType';
import { promoBannerType } from './promoBannerType';
import { affiliateStoreType } from './affiliateStoreType';
import { storeCategoryType } from './storeCategoryType';
import { storeUpdateRequest } from './storeUpdateRequest';
import { deliveryPricingConfigType } from './deliveryPricingConfigType';
import { repartidorType } from './repartidorType';
import { legalAcceptanceType } from './legalAcceptanceType';
import { deliveryScheduleConfigType } from './deliveryScheduleConfigType';
import { whatsappTemplateDeliveryType } from './whatsappTemplateDeliveryType';
import { commercialSettingsType } from './commercialSettingsType';
import { commercialAuditType } from './commercialAuditType';
import { commercialCommissionUsageType } from './commercialCommissionUsageType';

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    blockContentType, 
    categoryType, 
    productType, 
    option, 
    optionGroup, 
    productUpdateRequest, 
    storeUpdateRequest,
    orderType, 
    salesType, 
    promoBannerType,
    affiliateStoreType, 
    repartidorType,
    legalAcceptanceType,
    storeCategoryType,
    deliveryPricingConfigType,
    deliveryScheduleConfigType,
    whatsappTemplateDeliveryType,
    commercialSettingsType,
    commercialAuditType,
    commercialCommissionUsageType
  ],
};

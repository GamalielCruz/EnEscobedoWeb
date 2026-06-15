import { type SchemaTypeDefinition } from 'sanity'

import {blockContentType} from './blockContentType'
import {categoryType} from './categoryType'
import { productType } from './productType'
import { option } from './option'
import { optionGroup } from './optionGroup'
import { productUpdateRequest } from './productUpdateRequest'
import { orderType } from './orderType';
import { salesType } from './salesType';
import { affiliateStoreType } from './affiliateStoreType';
import { storeCategoryType } from './storeCategoryType';
import { storeUpdateRequest } from './storeUpdateRequest';
import { deliveryPricingConfigType } from './deliveryPricingConfigType';

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
    affiliateStoreType, 
    storeCategoryType,
    deliveryPricingConfigType
  ],
};

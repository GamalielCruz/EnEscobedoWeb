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
import { clickCollectOrderType } from './clickCollectOrderType';
import { storeCategoryType } from './storeCategoryType';

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [blockContentType, categoryType, productType, option, optionGroup, productUpdateRequest, orderType, salesType, affiliateStoreType, clickCollectOrderType, storeCategoryType],
};

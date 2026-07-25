import { v } from 'convex/values';

// Define the fields for coop_product_information
export const coopProductInformationFields = {
  externalId: v.optional(v.string()),
  accreditedTags: v.optional(
    v.array(
      v.object({
        code: v.string(),
        description: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        priority: v.optional(v.number()),
      }),
    ),
  ),
  ageRestriction: v.optional(
    v.object({
      code: v.optional(v.string()),
      description: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      priority: v.optional(v.number()),
    }),
  ),
  allergyInfo: v.optional(
    v.array(
      v.object({
        code: v.optional(v.string()),
        description: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        priority: v.optional(v.number()),
      }),
    ),
  ),
  animalFoodData: v.optional(
    v.object({
      animalFeedingTable: v.optional(
        v.union(
          v.record(
            v.string(),
            v.object({
              animalWeight: v.optional(
                v.object({
                  displayName: v.string(),
                  maxWeight: v.optional(v.union(v.string(), v.number())),
                  minWeight: v.optional(v.union(v.string(), v.number())),
                  unit: v.optional(v.string()),
                }),
              ),
              guidingAmount: v.optional(
                v.object({
                  displayName: v.optional(v.string()),
                  feedingAmount: v.optional(v.union(v.string(), v.number())),
                  frequency: v.optional(v.string()),
                  unit: v.optional(v.string()),
                }),
              ),
            }),
          ),
          v.array(
            v.object({
              animalWeight: v.optional(
                v.object({
                  displayName: v.string(),
                  maxWeight: v.optional(v.union(v.string(), v.number())),
                  minWeight: v.optional(v.union(v.string(), v.number())),
                  unit: v.optional(v.string()),
                }),
              ),
              guidingAmount: v.optional(
                v.object({
                  displayName: v.optional(v.string()),
                  feedingAmount: v.optional(v.union(v.string(), v.number())),
                  frequency: v.optional(v.string()),
                  unit: v.optional(v.string()),
                }),
              ),
            }),
          ),
        ),
      ),
      feedAdditiveStatement: v.optional(v.string()),
      feedAnalyticalConstituentsStatement: v.optional(v.string()),
      feedCompositionStatement: v.optional(v.string()),
      feedLifeStage: v.optional(v.string()),
      feedType: v.optional(v.string()),
      feedingInstructions: v.optional(v.string()),
      targetedConsumptionBy: v.optional(
        v.object({ code: v.string(), value: v.string() }),
      ),
    }),
  ),
  articleSold: v.optional(v.boolean()),
  availableOnline: v.optional(v.boolean()),
  catchData: v.optional(
    v.object({
      catchArea: v.optional(v.string()),
      catchMethod: v.optional(v.string()),
    }),
  ),
  claimReportingInformations: v.optional(
    v.array(
      v.object({
        claimDetails: v.array(
          v.object({
            element: v.optional(v.object({ code: v.string() })),
            markedOnPackage: v.optional(v.string()),
            type: v.optional(v.object({ code: v.string() })),
          }),
        ),
        description: v.array(
          v.object({
            languageCode: v.optional(v.string()),
            value: v.optional(v.string()),
          }),
        ),
      }),
    ),
  ),
  class: v.optional(v.string()),
  comparativePrice: v.optional(v.number()),
  comparativePriceData: v.optional(
    v.object({
      b2bPrice: v.number(),
      b2cPrice: v.number(),
    }),
  ),
  comparativePriceText: v.optional(v.string()),
  comparativePriceUnit: v.optional(
    v.object({
      postfix: v.optional(v.string()),
      text: v.string(),
      unit: v.optional(v.string()),
    }),
  ),
  compulsoryAdditiveLabelInformation: v.optional(v.string()),
  consumerInformationSymbolCodes: v.optional(
    v.union(
      v.array(
        v.object({
          code: v.string(),
          description: v.string(),
          imageUrl: v.string(),
          priority: v.number(),
        }),
      ),
      v.record(
        v.string(),
        v.object({
          code: v.string(),
          description: v.string(),
          imageUrl: v.string(),
          priority: v.number(),
        }),
      ),
    ),
  ),
  consumerInformationText: v.optional(v.array(v.string())),
  consumerInstructions: v.optional(
    v.object({
      storageInstructions: v.optional(v.string()),
      usageInstructions: v.optional(v.string()),
    }),
  ),
  contactInformations: v.optional(
    v.array(
      v.object({
        address: v.optional(v.string()),
        channels: v.optional(
          v.array(
            v.object({
              code: v.optional(v.string()),
              displayName: v.string(),
              value: v.optional(v.string()),
            }),
          ),
        ),
        name: v.optional(v.string()),
        typeName: v.string(),
      }),
    ),
  ),
  countryOfOriginCodes: v.optional(
    v.array(
      v.object({
        code: v.string(),
        value: v.string(),
      }),
    ),
  ),
  declarationOfOrigin: v.optional(v.string()),
  deposit: v.optional(v.number()),
  depositData: v.optional(
    v.object({
      b2bPrice: v.optional(v.number()),
      b2cPrice: v.optional(v.number()),
    }),
  ),
  description: v.optional(v.string()),
  ean: v.optional(v.string()),
  fishReportingInformations: v.optional(
    v.union(
      v.array(
        v.object({
          catchInformation: v.array(
            v.object({
              catchAreas: v.array(
                v.object({
                  code: v.string(),
                  name: v.optional(v.string()),
                }),
              ),
              catchMethods: v.array(
                v.object({
                  code: v.string(),
                  name: v.string(),
                }),
              ),
              productionMethodForFishAndSeafood: v.optional(
                v.object({
                  code: v.string(),
                }),
              ),
              storageState: v.optional(
                v.object({
                  code: v.string(),
                }),
              ),
            }),
          ),
          code: v.optional(v.string()),
          name: v.optional(v.string()),
        }),
      ),
      v.record(
        v.string(),
        v.object({
          catchInformation: v.record(
            v.string(),
            v.object({
              catchAreas: v.optional(
                v.record(v.string(), v.object({ code: v.string() })),
              ),
              catchMethods: v.optional(
                v.union(
                  v.record(
                    v.string(),
                    v.object({
                      name: v.string(),
                      code: v.optional(v.string()),
                    }),
                  ),
                  v.string(),
                ),
              ),
              productionMethodForFishAndSeafood: v.optional(
                v.object({ code: v.string() }),
              ),
              storageState: v.optional(v.object({ code: v.string() })),
            }),
          ),
          code: v.string(),
          name: v.string(),
        }),
      ),
    ),
  ),
  fromSweden: v.optional(v.boolean()),
  healthClaimDescription: v.optional(v.string()),
  healthSafetyLabels: v.optional(
    v.array(
      v.object({
        code: v.string(),
        description: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        priority: v.optional(v.number()),
      }),
    ),
  ),
  healthSafetyPrecautionaryStatementText: v.optional(
    v.union(v.array(v.string()), v.record(v.string(), v.string())),
  ),
  healthSafetySignalStatementText: v.optional(
    v.union(v.array(v.string()), v.record(v.string(), v.string())),
  ),
  healthSafetySignalWordsCode: v.optional(
    v.union(v.array(v.string()), v.record(v.string(), v.string())),
  ),
  historicalPriceData: v.optional(
    v.object({
      b2bPrice: v.optional(v.number()),
      b2cPrice: v.optional(v.number()),
    }),
  ),
  id: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  isMagazine: v.optional(v.boolean()),
  listOfIngredients: v.optional(v.string()),
  localProduct: v.optional(
    v.object({
      code: v.optional(v.string()),
      description: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      priority: v.optional(v.number()),
    }),
  ),
  manufacturerName: v.optional(v.string()),
  maxStorageTemperature: v.optional(v.string()),
  name: v.optional(v.string()),
  navCategories: v.optional(
    v.array(
      v.object({
        code: v.string(),
        name: v.string(),
        superCategories: v.array(
          v.object({
            code: v.string(),
            name: v.string(),
            superCategories: v.array(
              v.object({
                code: v.string(),
                name: v.string(),
                superCategories: v.optional(
                  v.array(
                    v.object({
                      code: v.string(),
                      name: v.string(),
                      superCategories: v.optional(v.string()),
                    }),
                  ),
                ),
              }),
            ),
          }),
        ),
      }),
    ),
  ),
  newItem: v.optional(
    v.object({
      code: v.optional(v.string()),
      description: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      priority: v.optional(v.number()),
    }),
  ),
  nonFoodIngredientStatement: v.optional(v.string()),
  nutrientBasis: v.optional(
    v.object({
      quantity: v.optional(v.number()),
    }),
  ),
  nutrientInformation: v.optional(
    v.array(
      v.object({
        header: v.optional(
          v.object({
            nutrientBasisQuantity: v.optional(v.number()),
            nutrientBasisQuantityType: v.optional(v.string()),
            nutrientBasisQuantityUnit: v.optional(
              v.object({
                code: v.optional(v.string()),
                value: v.optional(v.string()),
              }),
            ),
            preparationState: v.optional(
              v.object({
                code: v.optional(v.string()),
                value: v.optional(v.string()),
              }),
            ),
          }),
        ),
      }),
    ),
  ),
  nutrientLinks: v.optional(
    v.array(
      v.object({
        amount: v.optional(v.union(v.string(), v.array(v.string()))),
        description: v.string(),
        percentageOfDailyIntake: v.optional(v.string()),
        unit: v.optional(v.string()),
      }),
    ),
  ),
  nutritionalClaimData: v.optional(
    v.object({
      claimMarkedOnPackage: v.optional(v.string()),
      nutritionalClaimNutrientElementCode: v.optional(
        v.object({
          code: v.optional(v.string()),
          value: v.optional(v.string()),
        }),
      ),
      nutritionalClaimTypeCode: v.optional(
        v.object({
          code: v.optional(v.string()),
          value: v.optional(v.string()),
        }),
      ),
    }),
  ),
  onlinePromotions: v.optional(
    v.array(
      v.object({
        adjustedPercentageDiscount: v.optional(v.union(v.string(), v.number())),
        comparativePrice: v.optional(
          v.object({
            b2bPrice: v.number(),
            b2cPrice: v.number(),
          }),
        ),
        endDate: v.string(),
        higherThanHistoricalPrice: v.optional(v.boolean()),
        id: v.string(),
        maxNumberOfUse: v.optional(v.number()),
        maxNumberOfUseWithUnit: v.optional(
          v.object({
            unit: v.string(),
            value: v.optional(v.number()),
          }),
        ),
        medMeraRequired: v.optional(v.boolean()),
        message: v.string(),
        numberOfProductRequired: v.optional(v.union(v.string(), v.number())),
        percentageDiscount: v.optional(v.union(v.string(), v.number())),
        piecePrice: v.optional(v.number()),
        piecePriceData: v.optional(
          v.object({
            b2bPrice: v.number(),
            b2cPrice: v.number(),
          }),
        ),
        // Optional since 2026-07: Coop dropped the flat `price` from live
        // promotion payloads and now sends only `priceData`. The top-level
        // `salesPrice`/`promotionPrice` pairs went the same way, which is why
        // those were already optional.
        price: v.optional(v.number()),
        priceData: v.object({
          b2bPrice: v.number(),
          b2cPrice: v.number(),
        }),
        priority: v.number(),
        startDate: v.string(),
        type: v.string(),
      }),
    ),
  ),
  originCountry: v.optional(
    v.object({
      code: v.optional(v.string()),
      value: v.optional(v.string()),
    }),
  ),
  packageSize: v.optional(v.number()),
  packageSizeInformation: v.optional(v.string()),
  packageSizeUnit: v.optional(v.string()),
  percentageOfAlcoholByVolume: v.optional(v.string()),
  periodSafeToUseAfterOpening: v.optional(v.number()),
  pharmaceuticalData: v.optional(
    v.object({
      isPharmaceutical: v.optional(v.boolean()),
      pharmaceuticalType: v.optional(
        v.object({
          code: v.optional(v.string()),
          value: v.optional(v.string()),
        }),
      ),
    }),
  ),
  piecePrice: v.optional(v.number()),
  piecePriceData: v.optional(
    v.object({
      b2bPrice: v.optional(v.number()),
      b2cPrice: v.optional(v.number()),
    }),
  ),
  pieceWeight: v.optional(v.number()),
  preparationInstructions: v.optional(v.string()),
  preparationInstructionsList: v.optional(v.array(v.string())),
  productionMethodForFishAndSeafoodCode: v.optional(
    v.object({
      code: v.optional(v.string()),
      value: v.optional(v.string()),
    }),
  ),
  promotionPrice: v.optional(v.number()),
  promotionPriceData: v.optional(
    v.object({
      b2bPrice: v.optional(v.number()),
      b2cPrice: v.optional(v.number()),
    }),
  ),
  regulatedArticleDescription: v.optional(v.string()),
  regulatedProductName: v.optional(v.string()),
  replacementCountries: v.optional(
    v.array(
      v.object({
        code: v.string(),
        value: v.string(),
      }),
    ),
  ),
  salesPrice: v.optional(v.number()),
  salesPriceData: v.optional(
    v.object({
      b2bPrice: v.optional(v.number()),
      b2cPrice: v.optional(v.number()),
    }),
  ),
  salesUnit: v.optional(v.string()),
  servingSizeDescription: v.optional(v.string()),
  shortTradeItemMarketingMessage: v.optional(
    v.object({
      seq1: v.optional(v.string()),
      seq2: v.optional(v.string()),
      seq3: v.optional(v.string()),
      seq4: v.optional(v.string()),
      seq5: v.optional(v.string()),
    }),
  ),
  speciesForFisheryData: v.optional(
    v.object({
      statisticsPurposesCode: v.optional(v.string()),
      statisticsPurposesName: v.optional(v.string()),
    }),
  ),
  storageStateCode: v.optional(
    v.object({
      code: v.optional(v.string()),
      value: v.optional(v.string()),
    }),
  ),
  sustainabilityInfo: v.optional(
    v.array(
      v.object({
        productScore: v.array(
          v.object({
            param: v.string(),
            paramId: v.string(),
            score: v.union(v.number(), v.null()),
          }),
        ),
      }),
    ),
  ),
  sustainabilityInfoApplicable: v.optional(v.boolean()),
  type: v.optional(v.string()),
  variances: v.optional(
    v.array(
      v.object({
        code: v.string(),
        name: v.string(),
        // Optional for the same reason as `onlinePromotions[].price` above.
        price: v.optional(v.number()),
        priceData: v.object({
          b2bPrice: v.number(),
          b2cPrice: v.number(),
        }),
        quantity: v.number(),
        unit: v.string(),
      }),
    ),
  ),
  variety: v.optional(v.string()),
  vat: v.optional(
    v.object({
      code: v.optional(v.string()),
      type: v.optional(v.string()),
      value: v.optional(v.number()),
    }),
  ),
};

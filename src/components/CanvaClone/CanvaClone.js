import "./CanvaClone.css";
import CreativeEditorSDK from '@cesdk/cesdk-js';
import React, { useEffect, useRef } from 'react';
import { findWargativeAssets } from './wargativeStockLibrary';

function WargativeEditor() {
  const cesdkContainer = useRef(null);

  useEffect(() => {
    // path to the local image to load into CE.SDK
    const customImagePath = `${window.location.protocol + "//" + window.location.host}/resources/programming.png`;

    let cesdk;
    let config = {
      // loading the business card template
      initialSceneURL: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_business_card_1.scene`,

      // loading asset sources
      assetSources: {
        wargativeStock: {
          findAssets: findWargativeAssets,
          credits: {
            name: 'Wargative Collection',
            url: 'https://unsplash.com'
          }
        },
        // loading a custom image into CE.SDK
        custom: {
          findAssets: () => {
            return {
              assets: [{
                id: "custom-image-1",
                type: 'ly.img.image',
                locale: 'en',
                label: "Programming",
                thumbUri: customImagePath,
                size: {
                  width: 512,
                  height: 512
                },
                meta: {
                  uri: customImagePath
                },
                context: {
                  sourceId: 'custom'
                },
                credits: {
                  name: "Freepik",
                  url: "https://www.flaticon.com"
                }
              }],
              currentPage: 1,
              total: 1,
              nextPage: undefined
            };
          }
        }
      },

      // translating the labels associated with the asset sources
      i18n: {
        en: {
          'libraries.wargativeStock.label': 'Wargative Photos',
          'libraries.custom.label': 'Custom'
        }
      },

      // initializing CE.SDK with some templates
      presets: {
        templates: {
          postcard_1: {
            label: 'Postcard Design',
            scene: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_postcard_1.scene`,
            thumbnailURL: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_postcard_1.png`
          },
          postcard_2: {
            label: 'Postcard Tropical',
            scene: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_postcard_2.scene`,
            thumbnailURL: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_postcard_2.png`
          },
          business_card_1: {
            label: 'Business card',
            scene: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_business_card_1.scene`,
            thumbnailURL: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_business_card_1.png`
          },
          instagram_photo_1: {
            label: 'Instagram photo',
            scene: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_instagram_photo_1.scene`,
            thumbnailURL: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_instagram_photo_1.png`
          },
          instagram_story_1: {
            label: 'Instagram story',
            scene: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_instagram_story_1.scene`,
            thumbnailURL: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_instagram_story_1.png`
          },
          poster_1: {
            label: 'Poster',
            scene: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_poster_1.scene`,
            thumbnailURL: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_poster_1.png`
          },
          presentation_4: {
            label: 'Presentation',
            scene: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_presentation_1.scene`,
            thumbnailURL: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_presentation_1.png`
          },
          collage_1: {
            label: 'Collage',
            scene: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_collage_1.scene`,
            thumbnailURL: `https://cdn.img.ly/packages/imgly/cesdk-js/latest/assets/templates/cesdk_collage_1.png`
          }
        }
      },
    };

    if (cesdkContainer.current) {
      CreativeEditorSDK.init(cesdkContainer.current, config).then(
          (instance) => {
            cesdk = instance;
          }
      );
    }

    return () => {
      if (cesdk) {
        cesdk.dispose();
      }
    };

  }, [cesdkContainer]);

  return (
      <div className="caseContainer">
        <div className="wrapper">
          <div ref={cesdkContainer} className="cesdk"></div>
        </div>
      </div>
  );
};

export default WargativeEditor;

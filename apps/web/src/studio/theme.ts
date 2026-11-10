// AG Studio in SwarmPay's own look: DM Sans, the green accent and the white cards on the page's canvas.
import {studioTheme} from 'ag-studio';
import tokens from '../brand-tokens.json';

const {ink,muted,line,evergreen:green,cloud:canvas,successBg:highlight,white}=tokens.colors;
const palette=[green,tokens.colors.violet,tokens.colors.blocked,tokens.colors.hold,muted,tokens.colors.sky,tokens.colors.citron];
const border={width:1,color:line};

export const swarmPayStudioTheme=studioTheme.withParams({
  fontFamily:"'DM Sans', -apple-system, 'Segoe UI', sans-serif",fontSize:14,textColor:ink,foregroundColor:ink,subtleTextColor:muted,
  backgroundColor:white,borderColor:line,accentColor:green,iconColor:green,rowHoverColor:highlight,
  studioWrapperBorder:false,studioWrapperBorderRadius:0,studioWrapperSpacing:0,studioWrapperBackgroundColor:canvas,
  studioCanvasBorder:false,studioCanvasBorderRadius:0,studioCanvasShadow:false,studioCanvasBackgroundColor:canvas,studioCanvasPadding:12,studioCanvasRowHeight:18,
  studioWidgetBackgroundColor:white,studioWidgetBorder:border,studioWidgetBorderRadius:tokens.radii.card,studioWidgetPadding:16,
  studioWidgetTitleFontFamily:"'Manrope', 'DM Sans', sans-serif",studioWidgetTitleFontSize:15,studioWidgetTitleFontWeight:700,studioWidgetTitleTextColor:ink,
  studioWidgetSubtitleFontSize:14,studioWidgetSubtitleTextColor:muted,studioWidgetCaptionFontSize:14,studioWidgetCaptionTextColor:muted,studioWidgetResizeBorderColor:green,
  studioPanelContainerBackgroundColor:white,studioPanelContainerBorder:border,studioPanelDividerColor:line,studioPanelDividerActiveColor:green,
  studioToggleButtonActiveBackgroundColor:highlight,studioToggleButtonActiveBorderColor:green,studioToggleButtonActiveColor:green,
  gridHeaderTextColor:muted,gridHeaderFontWeight:600,gridHeaderFontSize:14,gridRowHeight:44,gridRowBorder:border,gridHeaderRowBorder:border,gridWrapperBorder:false,
  chartTextColor:ink,chartSubtleTextColor:muted,chartAxisLineColor:line,chartGridLineColor:line,
  ...Object.fromEntries(palette.flatMap((color,i)=>[[`chartPaletteFills${i+1}Color`,color],[`chartPaletteStrokes${i+1}Color`,color]])),
});

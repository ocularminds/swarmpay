// AG Studio in SwarmPay's own look: DM Sans, the green accent and the white cards on the page's canvas.
import {studioTheme} from 'ag-studio';

const ink='#1a3430',muted='#6b7c77',line='#e4eae7',green='#11695b',canvas='#f7f9f8',highlight='#eef6f1';
const palette=['#11695b','#9dd17c','#46a185','#d9a441','#5b67c4','#c1e5a5','#8f3b25','#7d8b86','#2f8f7a','#b9c4c0'];
const border={width:1,color:line};

export const swarmPayStudioTheme=studioTheme.withParams({
  fontFamily:"'DM Sans', -apple-system, 'Segoe UI', sans-serif",fontSize:14,textColor:ink,foregroundColor:ink,subtleTextColor:muted,
  backgroundColor:'#fff',borderColor:line,accentColor:green,iconColor:green,rowHoverColor:highlight,
  studioWrapperBorder:false,studioWrapperBorderRadius:0,studioWrapperSpacing:0,studioWrapperBackgroundColor:canvas,
  studioCanvasBorder:false,studioCanvasBorderRadius:0,studioCanvasShadow:false,studioCanvasBackgroundColor:canvas,studioCanvasPadding:12,studioCanvasRowHeight:18,
  studioWidgetBackgroundColor:'#fff',studioWidgetBorder:border,studioWidgetBorderRadius:14,studioWidgetPadding:12,
  studioWidgetTitleFontFamily:"'Manrope', 'DM Sans', sans-serif",studioWidgetTitleFontSize:15,studioWidgetTitleFontWeight:700,studioWidgetTitleTextColor:ink,
  studioWidgetSubtitleFontSize:13,studioWidgetSubtitleTextColor:muted,studioWidgetCaptionFontSize:12,studioWidgetCaptionTextColor:muted,studioWidgetResizeBorderColor:green,
  studioPanelContainerBackgroundColor:'#fff',studioPanelContainerBorder:border,studioPanelDividerColor:line,studioPanelDividerActiveColor:green,
  studioToggleButtonActiveBackgroundColor:highlight,studioToggleButtonActiveBorderColor:green,studioToggleButtonActiveColor:green,
  gridHeaderTextColor:muted,gridHeaderFontWeight:600,gridHeaderFontSize:13,gridRowHeight:40,gridRowBorder:border,gridHeaderRowBorder:border,gridWrapperBorder:false,
  chartTextColor:ink,chartSubtleTextColor:muted,chartAxisLineColor:line,chartGridLineColor:line,
  ...Object.fromEntries(palette.flatMap((color,i)=>[[`chartPaletteFills${i+1}Color`,color],[`chartPaletteStrokes${i+1}Color`,color]])),
});

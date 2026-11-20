#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "NunheadHUD.generated.h"

// Score, clock, messages and the kick-charge bar, drawn straight to the canvas (no widget assets needed).
UCLASS()
class NUNHEADGTA_API ANunheadHUD : public AHUD
{
	GENERATED_BODY()
public:
	virtual void DrawHUD() override;
};

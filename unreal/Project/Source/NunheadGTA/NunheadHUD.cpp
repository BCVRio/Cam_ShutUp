#include "NunheadHUD.h"
#include "NunheadGameMode.h"
#include "CamCharacter.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Kismet/GameplayStatics.h"

void ANunheadHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas || !GEngine) return;
	ANunheadGameMode* GM = Cast<ANunheadGameMode>(UGameplayStatics::GetGameMode(this));
	UFont* Big = GEngine->GetLargeFont(); UFont* Small = GEngine->GetMediumFont();
	const float W = Canvas->SizeX, H = Canvas->SizeY;
	const FLinearColor Navy(0.08f, 0.15f, 0.37f, 0.85f), Gold(0.95f, 0.76f, 0.2f), White(1, 1, 1);
	if (GM)
	{
		// score + clock panel
		const FString Score = FString::Printf(TEXT("BOSCO  %d - %d  ROVERS"), GM->ScoreHome, GM->ScoreAway);
		const int32 M = FMath::FloorToInt(GM->TimeLeft / 60.f), S = FMath::FloorToInt(GM->TimeLeft) % 60;
		const FString Clock = GM->bMatchOn ? FString::Printf(TEXT("%d:%02d"), M, S) : TEXT("Kick the ball to start");
		DrawRect(Navy, W / 2 - 170, 18, 340, 64);
		DrawText(Score, Gold, W / 2 - 150, 26, Big, 1.1f);
		DrawText(Clock, White, W / 2 - 150, 54, Small, 1.0f);
		if (!GM->Message.IsEmpty()) { DrawRect(FLinearColor(0, 0, 0, 0.55f), W / 2 - 300, H - 150, 600, 44); DrawText(GM->Message, Gold, W / 2 - 290, H - 140, Big, 1.0f); }
	}
	if (ACamCharacter* Cam = Cast<ACamCharacter>(GetOwningPawn()))
	{
		if (Cam->KickCharge > 0.f) { DrawRect(FLinearColor(0, 0, 0, 0.5f), W / 2 - 120, H - 90, 240, 16); DrawRect(Gold, W / 2 - 118, H - 88, 236 * Cam->KickCharge, 12); }
		DrawText(TEXT("WASD move  Shift sprint  Space jump  hold F / X to charge a kick, A/D while kicking curls"), FLinearColor(1, 1, 1, 0.7f), 16, H - 30, Small, 0.9f);
	}
}

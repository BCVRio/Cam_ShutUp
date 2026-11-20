#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "Goal.h"
#include "NunheadGameMode.generated.h"

class AFootball;

// Match flow: kick-off, 3 minute five-a-side on Nunhead Green, goals, celebrations, full time.
UCLASS()
class NUNHEADGTA_API ANunheadGameMode : public AGameModeBase
{
	GENERATED_BODY()
public:
	ANunheadGameMode();
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Match") float MatchLength = 180.f;
	UPROPERTY(BlueprintReadOnly, Category="Match") int32 ScoreHome = 0;
	UPROPERTY(BlueprintReadOnly, Category="Match") int32 ScoreAway = 0;
	UPROPERTY(BlueprintReadOnly, Category="Match") float TimeLeft = 180.f;
	UPROPERTY(BlueprintReadOnly, Category="Match") bool bMatchOn = false;
	UPROPERTY(BlueprintReadOnly, Category="Match") float CelebrateT = 0.f;
	UPROPERTY(BlueprintReadOnly, Category="Match") FString Message;
	UPROPERTY(BlueprintReadOnly, Category="Match") AFootball* Ball = nullptr;

	UFUNCTION(BlueprintCallable, Category="Match") void StartMatch();
	UFUNCTION(BlueprintCallable, Category="Match") void EndMatch();
	void BallInGoal(AGoal* Goal, AFootball* InBall);
	void Feed(const FString& Text, float Seconds = 2.5f);
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
private:
	float MessageT = 0.f;
	float ReplayLock = 0.f;
};
